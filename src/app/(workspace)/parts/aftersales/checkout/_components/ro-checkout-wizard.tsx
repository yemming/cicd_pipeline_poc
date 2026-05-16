"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  DISCOUNT_OPTIONS,
  INVOICE_KINDS,
  INVOICE_KIND_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  STATUS_CHIP,
  STATUS_LABEL,
  STEP_LABELS,
  type FeeLine,
  type FeeSummary,
  type InvoiceKind,
  type PaymentMethod,
  type RoCheckoutStatus,
} from "@/domain/ro-checkouts.constants";
import type { RoCheckoutDetail } from "@/domain/ro-checkouts";
import {
  applyDiscountAction,
  clearSignAction,
  completeAction,
  confirmFeesAction,
  confirmPaymentAction,
  deleteAction,
  markReceiptPrintedAction,
  refreshFeeSummaryAction,
  signAction,
} from "@/lib/aftersales/ro-checkout-actions";

type Banner = { ok: boolean; msg: string } | null;

type Props = {
  data: RoCheckoutDetail;
  canEdit: boolean;
};

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `NT$${n.toLocaleString("en-US")}`;
}

function deriveStep(status: RoCheckoutStatus, hasFeesConfirmed: boolean): 1 | 2 | 3 | 4 {
  if (status === "completed") return 4;
  if (status === "paid") return 4;
  if (status === "signed") return 3;
  if (status === "in_progress" && hasFeesConfirmed) return 2;
  return 1;
}

export function RoCheckoutWizard({ data, canEdit }: Props) {
  useSetPageHeader({
    title: "結帳收款",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "結帳收款", href: "/parts/aftersales/checkout" },
      { label: data.checkout_no },
    ],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const initialStep = deriveStep(data.status, !!data.fees_confirmed_at);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(initialStep);

  const summary = (data.fee_summary ?? {}) as FeeSummary;
  const sig = data.customer_signature ?? {};
  const payment = data.payment ?? {};
  const invoice = data.invoice ?? {};

  function showBanner(b: NonNullable<Banner>) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function refresh() {
    startTransition(async () => {
      const res = await refreshFeeSummaryAction(data.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已重新計算費用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function changeDiscount(pct: number) {
    startTransition(async () => {
      const res = await applyDiscountAction(data.id, pct);
      if (res.ok) {
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function confirmFees() {
    startTransition(async () => {
      const res = await confirmFeesAction(data.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 費用明細已確認" });
        setStep(2);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function doSign() {
    if (!data.ro.customer_name) {
      showBanner({ ok: false, msg: "工單沒有掛車主，無法簽名" });
      return;
    }
    startTransition(async () => {
      const res = await signAction(data.id, {
        signature_text: data.ro.customer_name ?? "車主簽名",
        customer_name: data.ro.customer_name ?? undefined,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已完成電子簽名" });
        setStep(3);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function clearSig() {
    if (!confirm("確認要清除簽名重新簽嗎？")) return;
    startTransition(async () => {
      const res = await clearSignAction(data.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已清除簽名" });
        setStep(2);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  /* step3 暫存 */
  const [payMethod, setPayMethod] = useState<PaymentMethod>(payment.method ?? "credit_card");
  const [invKind, setInvKind] = useState<InvoiceKind>(invoice.kind ?? "cloud");
  const [invTaxId, setInvTaxId] = useState(invoice.tax_id ?? "");

  function confirmPay() {
    startTransition(async () => {
      const res = await confirmPaymentAction(data.id, {
        payment_method: payMethod,
        invoice_kind: invKind,
        invoice_tax_id: invTaxId,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 收款完成，準備關單" });
        setStep(4);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function complete() {
    startTransition(async () => {
      const res = await completeAction(data.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "🎉 工單已結案" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function printReceipt() {
    startTransition(async () => {
      const res = await markReceiptPrintedAction(data.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已標記列印（demo）" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function removeCheckout() {
    if (!confirm(`確認要刪除結帳單 ${data.checkout_no}？`)) return;
    startTransition(async () => {
      const res = await deleteAction(data.id);
      if (res.ok) {
        router.push("/parts/aftersales/checkout");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const lines = summary.lines ?? [];
  const fenced = !canEdit || data.status === "completed";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* RO header */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4 flex items-center gap-4 flex-wrap">
        <div className="flex flex-col">
          <div className="text-[11px] tracking-wider text-[#9A9890]">結帳編號</div>
          <div className="font-mono text-[18px] font-semibold text-[#1A3A5C]">
            {data.checkout_no}
          </div>
        </div>
        <div className="h-10 w-px bg-[#EEECE6]" />
        <div className="flex flex-col">
          <div className="text-[11px] text-[#9A9890]">工單</div>
          <Link
            href={`/parts/aftersales/repair-orders/${data.repair_order_id}/lines`}
            className="font-mono text-[14px] text-[#185FA5] hover:underline"
          >
            {data.ro.ro_code}
          </Link>
        </div>
        <div className="flex flex-col">
          <div className="text-[11px] text-[#9A9890]">車主・車輛</div>
          <div className="text-[12.5px]">
            {data.ro.customer_name ?? "—"} ·{" "}
            <span className="font-mono text-[#5A5955]">
              {data.ro.vehicle_license_plate ?? "—"}
            </span>{" "}
            <span className="text-[#5A5955]">{data.ro.vehicle_model_name ?? ""}</span>
          </div>
        </div>
        {data.ro.sa_name ? (
          <div className="flex flex-col">
            <div className="text-[11px] text-[#9A9890]">SA</div>
            <div className="text-[12.5px]">{data.ro.sa_name}</div>
          </div>
        ) : null}
        {data.final_inspection_status === "completed" ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">
            竣工複檢 ✅ 通過
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2 py-1 rounded-md text-[11.5px] ${STATUS_CHIP[data.status]}`}
          >
            {STATUS_LABEL[data.status]}
          </span>
          {data.status !== "completed" ? (
            <button
              onClick={removeCheckout}
              disabled={isPending || !canEdit}
              className="h-[28px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
            >
              刪除
            </button>
          ) : null}
        </div>
      </header>

      {/* 步驟導覽 */}
      <nav className="flex bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        {STEP_LABELS.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3 | 4;
          const active = step === n;
          const done = stepDone(n, data);
          return (
            <button
              key={label}
              onClick={() => setStep(n)}
              className={`flex-1 px-3 py-2.5 text-[12.5px] border-r last:border-r-0 border-[#EEECE6] transition flex items-center justify-center gap-2 ${
                active
                  ? "bg-[#1A3A5C] text-white font-semibold"
                  : done
                    ? "bg-[#EAF3DE] text-[#3B6D11]"
                    : "bg-white text-[#5A5955] hover:bg-[#F8F7F4]"
              }`}
            >
              <span
                className={`w-[20px] h-[20px] rounded-full inline-flex items-center justify-center text-[11px] font-semibold ${
                  active
                    ? "bg-white text-[#1A3A5C]"
                    : done
                      ? "bg-[#3B6D11] text-white"
                      : "bg-[#F1EFE8] text-[#9A9890]"
                }`}
              >
                {done ? "✓" : n}
              </span>
              {label}
            </button>
          );
        })}
      </nav>

      {/* Step content */}
      {step === 1 ? (
        <Step1
          summary={summary}
          lines={lines}
          fenced={fenced}
          isPending={isPending}
          onRefresh={refresh}
          onChangeDiscount={changeDiscount}
          onConfirm={confirmFees}
        />
      ) : null}

      {step === 2 ? (
        <Step2
          payable={summary.payable ?? 0}
          customerName={data.ro.customer_name}
          signedAt={sig.signed_at ?? null}
          signatureText={sig.signature_text ?? null}
          fenced={fenced}
          isPending={isPending}
          onSign={doSign}
          onClear={clearSig}
        />
      ) : null}

      {step === 3 ? (
        <Step3
          payable={summary.payable ?? 0}
          method={payMethod}
          setMethod={setPayMethod}
          invKind={invKind}
          setInvKind={setInvKind}
          invTaxId={invTaxId}
          setInvTaxId={setInvTaxId}
          fenced={fenced || data.status === "paid" || data.status === "completed"}
          isPending={isPending}
          onConfirm={confirmPay}
          existingPayment={payment}
          existingInvoice={invoice}
        />
      ) : null}

      {step === 4 ? (
        <Step4
          checkoutNo={data.checkout_no}
          status={data.status}
          payable={summary.payable ?? 0}
          paymentMethod={payment.method}
          invoiceNo={invoice.invoice_no}
          invoiceKind={invoice.kind}
          closedAt={data.closed_at}
          receiptPrintedAt={data.receipt_printed_at}
          isPending={isPending}
          fenced={fenced}
          onComplete={complete}
          onPrint={printReceipt}
        />
      ) : null}

      {/* prev / next */}
      <footer className="flex items-center gap-2 pt-2">
        <button
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s))}
          disabled={step === 1}
          className="h-[32px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-40"
        >
          ← 上一步
        </button>
        <span className="text-[11.5px] text-[#9A9890] mx-auto">
          步驟 {step} / 4　{STEP_LABELS[step - 1]}
        </span>
        <button
          onClick={() => setStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : s))}
          disabled={step === 4}
          className="h-[32px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-40"
        >
          下一步：{step < 4 ? STEP_LABELS[step as 1 | 2 | 3] : "—"} →
        </button>
      </footer>

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
    </main>
  );
}

function stepDone(n: 1 | 2 | 3 | 4, data: RoCheckoutDetail): boolean {
  if (n === 1) return !!data.fees_confirmed_at;
  if (n === 2) return data.status === "signed" || data.status === "paid" || data.status === "completed";
  if (n === 3) return data.status === "paid" || data.status === "completed";
  if (n === 4) return data.status === "completed";
  return false;
}

/* ─────────────────────── SectionCard ─────────────────────── */
function SectionCard({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
        {sub ? <span className="text-[11.5px] text-[#9A9890]">{sub}</span> : null}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/* ─────────────────────── Step 1 ─────────────────────── */
function Step1({
  summary,
  lines,
  fenced,
  isPending,
  onRefresh,
  onChangeDiscount,
  onConfirm,
}: {
  summary: FeeSummary;
  lines: FeeLine[];
  fenced: boolean;
  isPending: boolean;
  onRefresh: () => void;
  onChangeDiscount: (pct: number) => void;
  onConfirm: () => void;
}) {
  const total = summary.total ?? 0;
  const payable = summary.payable ?? total;
  const subtotal = summary.subtotal ?? 0;
  const tax = summary.tax_amount ?? 0;
  const discount = summary.discount_amount ?? 0;
  const pct = summary.discount_pct ?? 0;

  return (
    <SectionCard title="💰 費用明細確認" sub="SA 與車主一起核對">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-[#F8F7F4] text-[#5A5955]">
            <tr>
              <th className="text-left py-2 px-2 font-medium w-[40px]">#</th>
              <th className="text-left py-2 px-2 font-medium">項目</th>
              <th className="text-center py-2 px-2 font-medium w-[80px]">工時</th>
              <th className="text-right py-2 px-2 font-medium w-[100px]">零件費</th>
              <th className="text-right py-2 px-2 font-medium w-[100px]">工時費</th>
              <th className="text-right py-2 px-2 font-medium w-[110px]">小計</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-6 text-[#9A9890]">
                  沒有明細，點上方「重新計算」帶入工單明細
                </td>
              </tr>
            ) : (
              lines.map((l) => (
                <tr
                  key={`${l.source}-${l.source_ref_id}`}
                  className={`border-t border-[#F1EFE8] ${l.is_addon ? "bg-[#FDF3E3]" : ""}`}
                >
                  <td className={`py-2 px-2 ${l.is_addon ? "text-[#854F0B]" : "text-[#9A9890]"}`}>
                    {l.is_addon ? "+" : l.no}
                  </td>
                  <td className={`py-2 px-2 ${l.is_addon ? "text-[#854F0B] font-medium" : ""}`}>
                    {l.label}
                  </td>
                  <td className="py-2 px-2 text-center font-mono text-[12px]">
                    {l.labor_units > 0 ? `${l.labor_units} LU` : "—"}
                  </td>
                  <td className="py-2 px-2 text-right">{fmtMoney(l.parts_amount)}</td>
                  <td className="py-2 px-2 text-right">{fmtMoney(l.labor_amount)}</td>
                  <td className="py-2 px-2 text-right font-semibold">
                    {fmtMoney(l.subtotal)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="text-[#5A5955]">
            <tr>
              <td colSpan={5} className="text-right py-1.5 px-2">
                小計（未稅）
              </td>
              <td className="text-right py-1.5 px-2 font-mono">{fmtMoney(subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={5} className="text-right py-1.5 px-2">
                稅（5%）
              </td>
              <td className="text-right py-1.5 px-2 font-mono">{fmtMoney(tax)}</td>
            </tr>
            {pct > 0 ? (
              <tr className="text-[#854F0B]">
                <td colSpan={5} className="text-right py-1.5 px-2">
                  折扣（{pct}% off）
                </td>
                <td className="text-right py-1.5 px-2 font-mono">- {fmtMoney(discount)}</td>
              </tr>
            ) : null}
            <tr className="border-t-2 border-[#1A3A5C] text-[#1A3A5C]">
              <td colSpan={5} className="text-right py-2 px-2 font-semibold">
                應付總計
              </td>
              <td className="text-right py-2 px-2 font-mono text-[16px] font-bold">
                {fmtMoney(payable)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#EEECE6] flex-wrap">
        <span className="text-[12.5px] text-[#5A5955]">折扣優惠</span>
        <select
          value={pct}
          onChange={(e) => onChangeDiscount(Number(e.target.value))}
          disabled={fenced || isPending}
          className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:opacity-50"
        >
          {DISCOUNT_OPTIONS.map((o) => (
            <option key={o.pct} value={o.pct}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          onClick={onRefresh}
          disabled={fenced || isPending}
          className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
        >
          {isPending ? "處理中⋯" : "重新計算"}
        </button>
        <span className="ml-auto text-[12.5px]">
          折後應付：
          <b className="text-[#1A3A5C] text-[16px] ml-2 font-mono">{fmtMoney(payable)}</b>
        </span>
      </div>

      <div className="mt-3 pt-3 border-t border-[#EEECE6] flex items-center gap-2">
        <span className="flex-1 text-[12.5px] text-[#0F6E56]">
          ✅ 確認費用明細已與車主當面核對，車主無異議後即可進入車主二簽
        </span>
        <button
          onClick={onConfirm}
          disabled={fenced || isPending || !lines.length}
          className="h-[34px] px-4 rounded text-[12.5px] font-semibold bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-40"
        >
          {isPending ? "處理中⋯" : "確認費用，進行車主二簽 →"}
        </button>
      </div>
    </SectionCard>
  );
}

/* ─────────────────────── Step 2 ─────────────────────── */
function Step2({
  payable,
  customerName,
  signedAt,
  signatureText,
  fenced,
  isPending,
  onSign,
  onClear,
}: {
  payable: number;
  customerName: string | null;
  signedAt: string | null;
  signatureText: string | null;
  fenced: boolean;
  isPending: boolean;
  onSign: () => void;
  onClear: () => void;
}) {
  const signed = !!signedAt;
  return (
    <SectionCard title="✍️ 車主第二次確認簽名" sub="維修授權最終確認 + 費用同意">
      <div className="bg-[#F8F7F4] rounded p-3 text-[12.5px] leading-7 mb-3">
        本人確認以下事項：
        <br />
        ① 已閱讀並同意本次維修項目及費用明細
        <br />
        ② 授權本店執行上述所有維修項目
        <br />
        ③ 確認車輛維修完畢，零件及工時費用合計{" "}
        <b className="text-[#1A3A5C]">{fmtMoney(payable)}</b>
        <br />
        ④ 車輛狀況與進廠時已確認差異無爭議
      </div>

      <div className="text-[11.5px] text-[#5A5955] mb-1.5 font-medium">
        車主簽名欄（請點擊下方區域進行電子簽名）
      </div>
      {signed ? (
        <div className="border-2 border-[#1D9E75] bg-[#E1F5EE] rounded-lg p-4 flex flex-col items-center gap-1.5">
          <div className="text-[26px] text-[#1A3A5C]" style={{ fontFamily: "cursive" }}>
            {signatureText ?? customerName ?? "—"}
          </div>
          <div className="text-[11px] text-[#0F6E56]">
            ✅ {fmtDateTime(signedAt)} · 電子簽名完成（防竄改）
          </div>
        </div>
      ) : (
        <button
          onClick={onSign}
          disabled={fenced || isPending}
          className="w-full border-2 border-dashed border-[#D5D3CB] rounded-lg p-6 text-center hover:border-[#1A3A5C] hover:bg-[#F8F7F4] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="text-[18px]">✍️</div>
          <div className="text-[12px] text-[#9A9890] mt-1">
            {isPending ? "簽名中⋯" : "點擊此處進行電子簽名"}
          </div>
        </button>
      )}
      <div className="text-[11px] text-[#9A9890] mt-2">
        * 電子簽名具有法律效力，簽名後系統自動記錄時間戳，不可修改
      </div>

      {signed && !fenced ? (
        <div className="mt-3 pt-3 border-t border-[#EEECE6] flex justify-end">
          <button
            onClick={onClear}
            disabled={isPending}
            className="h-[28px] px-3 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
          >
            清除簽名重新簽
          </button>
        </div>
      ) : null}
    </SectionCard>
  );
}

/* ─────────────────────── Step 3 ─────────────────────── */
function Step3({
  payable,
  method,
  setMethod,
  invKind,
  setInvKind,
  invTaxId,
  setInvTaxId,
  fenced,
  isPending,
  onConfirm,
  existingPayment,
  existingInvoice,
}: {
  payable: number;
  method: PaymentMethod;
  setMethod: (m: PaymentMethod) => void;
  invKind: InvoiceKind;
  setInvKind: (k: InvoiceKind) => void;
  invTaxId: string;
  setInvTaxId: (s: string) => void;
  fenced: boolean;
  isPending: boolean;
  onConfirm: () => void;
  existingPayment: { method?: PaymentMethod; paid_at?: string; amount?: number };
  existingInvoice: { kind?: InvoiceKind; invoice_no?: string; tax_id?: string; issued_at?: string };
}) {
  return (
    <div className="space-y-3">
      <SectionCard title="💳 收款方式">
        <div className="flex gap-2 flex-wrap mb-3">
          {PAYMENT_METHODS.map((p) => {
            const sel = method === p.id;
            return (
              <button
                key={p.id}
                onClick={() => !fenced && setMethod(p.id)}
                disabled={fenced || isPending}
                className={`flex-1 min-w-[110px] py-3 rounded-lg border text-center transition disabled:opacity-50 ${
                  sel
                    ? "border-[#1A3A5C] bg-[#EBF3FF]"
                    : "border-[#D5D3CB] bg-white hover:border-[#1A3A5C]"
                }`}
              >
                <div className="text-[20px]">{p.icon}</div>
                <div className="text-[12px] font-semibold text-[#2C2C2A] mt-1">{p.label}</div>
              </button>
            );
          })}
        </div>
        <div className="bg-[#EAF4FB] rounded p-3 text-[13px] text-[#1A3A5C] flex items-center justify-between">
          <span>應收金額</span>
          <span className="font-mono text-[18px] font-bold">{fmtMoney(payable)}</span>
        </div>
      </SectionCard>

      <SectionCard title="🧾 發票開立方式">
        <div className="flex gap-2 mb-3 flex-wrap">
          {INVOICE_KINDS.map((k) => {
            const sel = invKind === k.id;
            return (
              <button
                key={k.id}
                onClick={() => !fenced && setInvKind(k.id)}
                disabled={fenced || isPending}
                className={`flex-1 min-w-[120px] py-2.5 rounded-lg border text-center text-[12.5px] font-medium transition disabled:opacity-50 ${
                  sel
                    ? "border-[#1A3A5C] bg-[#EBF3FF] text-[#1A3A5C]"
                    : "border-[#D5D3CB] bg-white hover:border-[#1A3A5C]"
                }`}
              >
                {k.label}
              </button>
            );
          })}
        </div>
        {invKind === "company" ? (
          <input
            value={invTaxId}
            onChange={(e) => setInvTaxId(e.target.value)}
            placeholder="請輸入統一編號（8 碼）"
            disabled={fenced || isPending}
            className="w-full h-[34px] border border-[#D5D3CB] rounded px-3 text-[12.5px] focus:border-[#185FA5] disabled:opacity-50"
          />
        ) : null}
        {existingInvoice.invoice_no ? (
          <div className="mt-2 text-[11.5px] text-[#5A5955]">
            已開立發票：
            <b className="font-mono text-[#1A3A5C]">{existingInvoice.invoice_no}</b>
            {" · "}
            {fmtDateTime(existingInvoice.issued_at ?? null)}
          </div>
        ) : null}
      </SectionCard>

      <div className="flex justify-end">
        <button
          onClick={onConfirm}
          disabled={fenced || isPending}
          className="h-[40px] px-5 rounded text-[13px] font-semibold bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-40"
        >
          {existingPayment.method
            ? "已收款"
            : isPending
              ? "處理中⋯"
              : "確認收款，準備關單 →"}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────── Step 4 ─────────────────────── */
function Step4({
  checkoutNo,
  status,
  payable,
  paymentMethod,
  invoiceNo,
  invoiceKind,
  closedAt,
  receiptPrintedAt,
  isPending,
  fenced,
  onComplete,
  onPrint,
}: {
  checkoutNo: string;
  status: RoCheckoutStatus;
  payable: number;
  paymentMethod: PaymentMethod | undefined;
  invoiceNo: string | undefined;
  invoiceKind: InvoiceKind | undefined;
  closedAt: string | null;
  receiptPrintedAt: string | null;
  isPending: boolean;
  fenced: boolean;
  onComplete: () => void;
  onPrint: () => void;
}) {
  const isClosed = status === "completed";
  return (
    <SectionCard title={isClosed ? "🎉 工單結案完成" : "🎯 RO 關單"}>
      <div className="text-center py-4">
        <div className="text-[40px]">{isClosed ? "🎉" : "🎯"}</div>
        <div className={`text-[18px] font-bold mt-2 ${isClosed ? "text-[#0F6E56]" : "text-[#1A3A5C]"}`}>
          {isClosed ? "工單結案完成！" : "準備關閉工單"}
        </div>
        <div className="font-mono text-[16px] font-bold text-[#1A3A5C] bg-[#EBF3FF] inline-block px-4 py-1.5 rounded mt-3">
          {checkoutNo}
        </div>
        <div className="text-[12.5px] text-[#5A5955] leading-7 mt-3">
          結帳金額：
          <b className="text-[#1A3A5C] font-mono">{fmtMoney(payable)}</b>
          {paymentMethod ? `（${PAYMENT_METHOD_LABEL[paymentMethod]}）` : ""}
          <br />
          發票：
          {invoiceNo ? (
            <>
              <b className="font-mono">{invoiceNo}</b>
              {invoiceKind ? `（${INVOICE_KIND_LABEL[invoiceKind]}）` : ""}
            </>
          ) : (
            "—"
          )}
          {closedAt ? (
            <>
              <br />
              結案時間：{fmtDateTime(closedAt)}
            </>
          ) : null}
          {isClosed ? (
            <>
              <br />
              <span className="text-[#0F6E56]">
                電子發票已開立，RO 存檔 36 個月
              </span>
            </>
          ) : null}
        </div>

        <div className="flex justify-center gap-2 mt-4 flex-wrap">
          {!isClosed ? (
            <button
              onClick={onComplete}
              disabled={fenced || isPending || status !== "paid"}
              className="h-[40px] px-5 rounded text-[13px] font-semibold bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-40"
            >
              {isPending ? "關單中⋯" : "確認關單，標記 RO 已結案"}
            </button>
          ) : (
            <>
              <button
                onClick={onPrint}
                disabled={isPending}
                className="h-[36px] px-4 rounded text-[12.5px] font-semibold bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
              >
                {receiptPrintedAt ? `已列印 · ${fmtDateTime(receiptPrintedAt)}` : "列印收據"}
              </button>
              <Link
                href="/parts/aftersales/checkout"
                className="h-[36px] px-4 rounded text-[12.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                ← 返回列表
              </Link>
            </>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

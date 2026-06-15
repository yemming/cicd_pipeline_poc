"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { SignatureCanvas } from "@/components/signature-canvas";
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
  getCloseoutPdfUrlAction,
  markReceiptPrintedAction,
  refreshFeeSummaryAction,
  saveAddonAuthSignatureAction,
  setPickupEntrustmentAction,
  signAction,
} from "@/lib/aftersales/ro-checkout-actions";
// RP5 費用鎖定後修改申請
import { requestFeeUnlockApprovalAction } from "@/lib/aftersales/approval-request-actions";

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

  // RP2 ④：追加授權簽名（metadata.addon_auth_sig）
  const existingAddonAuthSig = ((data.metadata ?? {}) as {
    addon_auth_sig?: { screenshot_url?: string; signed_at?: string; customer_name?: string };
  }).addon_auth_sig ?? null;
  const [addonAuthSigImg, setAddonAuthSigImg] = useState<string | null>(
    existingAddonAuthSig?.screenshot_url ?? null,
  );

  function saveAddonAuthSig(dataUrl: string) {
    const addonLines = (summary.lines ?? []).filter((l) => l.is_addon).map((l) => l.label).join("、");
    startTransition(async () => {
      const res = await saveAddonAuthSignatureAction(data.id, {
        screenshot_url: dataUrl,
        customer_name: data.ro.customer_name ?? undefined,
        addon_items_snapshot: addonLines || undefined,
      });
      if (res.ok) {
        setAddonAuthSigImg(res.data.storage_url);
        showBanner({ ok: true, msg: "✓ 追加授權簽名已儲存" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  // 包F：委託取車授權（metadata.entrustment）
  const entrustment =
    ((data.metadata ?? {}) as {
      entrustment?: {
        is_entrusted?: boolean;
        agent_name?: string;
        relation?: string | null;
        id_note?: string | null;
        auth_method?: "phone" | "line_screenshot" | "presystem" | null;
        agent_sig_url?: string | null;
      };
    }).entrustment ?? null;
  const [entrustForm, setEntrustForm] = useState({
    is_entrusted: entrustment?.is_entrusted ?? false,
    agent_name: entrustment?.agent_name ?? "",
    relation: entrustment?.relation ?? "",
    id_note: entrustment?.id_note ?? "",
    auth_method: entrustment?.auth_method ?? ("phone" as "phone" | "line_screenshot" | "presystem"),
  });
  // 受託人電子簽名（委託取車用）
  const [agentSigImg, setAgentSigImg] = useState<string | null>(
    entrustment?.agent_sig_url ?? null,
  );
  function saveEntrustment() {
    startTransition(async () => {
      const res = await setPickupEntrustmentAction(data.id, {
        is_entrusted: entrustForm.is_entrusted,
        agent_name: entrustForm.agent_name,
        relation: entrustForm.relation,
        id_note: entrustForm.id_note,
        auth_method: entrustForm.is_entrusted ? entrustForm.auth_method : null,
        agent_sig_url: entrustForm.is_entrusted ? agentSigImg : null,
      });
      if (res.ok) {
        showBanner({
          ok: true,
          msg: entrustForm.is_entrusted ? "✓ 已記錄委託取車授權" : "✓ 已設為車主本人取車",
        });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

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

  // P7：折扣超限送審的「待審狀態」本地端暫存（pending 期間 selector 鎖定、顯示橘色提示）
  const [discountApprovalPending, setDiscountApprovalPending] = useState(false);
  const [discountPendingPct, setDiscountPendingPct] = useState<number | null>(null);

  function changeDiscount(pct: number) {
    startTransition(async () => {
      const res = await applyDiscountAction(data.id, pct);
      if (res.ok) {
        // P7：後端回 approval_required = true → 超限送審，折扣尚未套用
        if (res.data.approval_required) {
          setDiscountApprovalPending(true);
          setDiscountPendingPct(pct);
          showBanner({
            ok: true,
            msg: `折扣 ${pct}% 超出授權上限，已送主管審批（申請單末 6 碼：${res.data.approval_id?.slice(-6) ?? "—"}）。主管核准後折扣自動生效。`,
          });
        } else {
          // 正常折扣套用
          setDiscountApprovalPending(false);
          setDiscountPendingPct(null);
          router.refresh();
        }
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

  function doSign(dataUrl: string) {
    if (!data.ro.customer_name) {
      showBanner({ ok: false, msg: "工單沒有掛車主，無法簽名" });
      return;
    }
    if (!dataUrl) {
      showBanner({ ok: false, msg: "請先完成手寫簽名" });
      return;
    }
    startTransition(async () => {
      const res = await signAction(data.id, {
        signature_text: data.ro.customer_name ?? "車主簽名",
        customer_name: data.ro.customer_name ?? undefined,
        screenshot_url: dataUrl,
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

  // RP2：主管解鎖 Modal 狀態
  const [clearReasonModalOpen, setClearReasonModalOpen] = useState(false);
  const [clearReason, setClearReason] = useState("");

  // RP5 費用鎖定後修改申請 Modal
  const sigLocked = !!((data.metadata ?? {}) as { sig_locked?: boolean }).sig_locked;
  const [feeUnlockModalOpen, setFeeUnlockModalOpen] = useState(false);
  const [feeUnlockNotes, setFeeUnlockNotes] = useState("");

  function openClearSigModal() {
    setClearReason("");
    setClearReasonModalOpen(true);
  }

  function doConfirmClearSig() {
    if (!clearReason.trim()) return;
    setClearReasonModalOpen(false);
    startTransition(async () => {
      const res = await clearSignAction(data.id, { reason: clearReason.trim() });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 主管解鎖完成，請重新簽名" });
        setStep(2);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  /** RP5 費用鎖定後修改：送出 fee_unlock 授權申請 */
  function doFeeUnlockRequest() {
    if (!feeUnlockNotes.trim()) {
      showBanner({ ok: false, msg: "請填寫修改原因（稽核必填）" });
      return;
    }
    setFeeUnlockModalOpen(false);
    startTransition(async () => {
      const res = await requestFeeUnlockApprovalAction(
        data.repair_order_id,
        data.id,
        feeUnlockNotes.trim(),
      );
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 費用修改申請已送主管審批，主管核准後再使用「主管解鎖」" });
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

  // RP4 Layer3：結帳憑證 PDF 下載連結
  const initPdfUrl = ((data.metadata ?? {}) as Record<string, unknown>).closeout_pdf_url as string | null ?? null;
  const [closeoutPdfUrl, setCloseoutPdfUrl] = useState<string | null>(initPdfUrl);
  const [pdfFetching, setPdfFetching] = useState(false);

  function fetchPdfUrl() {
    if (pdfFetching) return;
    setPdfFetching(true);
    startTransition(async () => {
      const res = await getCloseoutPdfUrlAction(data.id);
      if (res.ok && res.data.url) {
        setCloseoutPdfUrl(res.data.url);
      }
      setPdfFetching(false);
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
          {/* P1-#10 / G2 GAP-06：費用確認後即可開立發票（去掉「先收款才能開」的硬限制，
              ECPay 開票實務上跟收款流程解耦 — SA 可先給發票、客戶再付） */}
          {data.fees_confirmed_at && data.ro.id ? (
            <Link
              href={`/einvoice/issue?roId=${data.repair_order_id}`}
              prefetch={false}
              data-test-id="ro-checkout-issue-invoice"
              className={`h-[30px] inline-flex items-center px-3.5 rounded-full text-[12.5px] font-medium shadow-sm ${
                data.invoice?.invoice_no
                  ? "bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                  : "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
              }`}
            >
              {data.invoice?.invoice_no ? `已開立 ${data.invoice.invoice_no}` : "🧾 開立發票"}
            </Link>
          ) : null}
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
      {/* RP5 費用鎖定後修改提示：已簽名（sigLocked）且結帳未完成時，顯示申請解鎖入口 */}
      {sigLocked && data.status !== "completed" && canEdit ? (
        <div className="bg-[#FDF3E3] border border-[#F0C97E] rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-[12.5px] text-[#854F0B] font-medium">🔒 費用已簽名鎖定</span>
          <span className="text-[12px] text-[#854F0B]">
            若需修改費用明細，請先申請主管授權，核准後由主管執行「主管解鎖」。
          </span>
          <button
            type="button"
            onClick={() => {
              setFeeUnlockNotes("");
              setFeeUnlockModalOpen(true);
            }}
            disabled={isPending}
            className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#854F0B] text-white hover:bg-[#6b3f08] disabled:opacity-50"
          >
            申請費用修改授權
          </button>
        </div>
      ) : null}

      {step === 1 ? (
        <Step1
          summary={summary}
          lines={lines}
          fenced={fenced}
          isPending={isPending}
          onRefresh={refresh}
          onChangeDiscount={changeDiscount}
          onConfirm={confirmFees}
          entrustForm={entrustForm}
          setEntrustForm={setEntrustForm}
          onSaveEntrustment={saveEntrustment}
          agentSigImg={agentSigImg}
          onAgentSign={(dataUrl) => setAgentSigImg(dataUrl)}
          onAgentReSign={() => setAgentSigImg(null)}
          addonAuthSigImg={addonAuthSigImg}
          addonAuthSigAt={existingAddonAuthSig?.signed_at ?? null}
          onAddonAuthSign={saveAddonAuthSig}
          onAddonAuthReSign={() => setAddonAuthSigImg(null)}
          // P7：折扣超限送審狀態
          discountApprovalPending={discountApprovalPending}
          discountPendingPct={discountPendingPct}
        />
      ) : null}

      {step === 2 ? (
        <Step2
          payable={summary.payable ?? 0}
          customerName={data.ro.customer_name}
          signedAt={sig.signed_at ?? null}
          signatureText={sig.signature_text ?? null}
          signatureImg={sig.screenshot_url ?? null}
          fenced={fenced}
          isPending={isPending}
          onSign={doSign}
          onClear={openClearSigModal}
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
          closeoutPdfUrl={closeoutPdfUrl}
          pdfFetching={pdfFetching}
          onFetchPdfUrl={fetchPdfUrl}
          nextServiceMileage={data.next_service_mileage ?? null}
          nextServiceDate={data.next_service_date ?? null}
          customerId={data.ro.customer_id ?? null}
          repairOrderId={data.repair_order_id}
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

      {/* RP2 主管解鎖 Modal */}
      {clearReasonModalOpen ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-[20px]">🔓</span>
              <div>
                <h3 className="text-[15px] font-semibold text-[#2C2C2A]">主管授權解鎖簽名</h3>
                <p className="text-[12px] text-[#5A5955] mt-0.5">
                  清除簽名需主管授權（售後主管 / 店長）。解鎖後客戶必須重新簽名。
                </p>
              </div>
            </div>
            <div className="bg-[#FDECEA] border border-[#F5AEAD] rounded px-3 py-2 text-[12px] text-[#CC0000]">
              ⚠️ 此動作將寫入稽核日誌，請確認您有足夠授權。
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-[#9A9890] font-medium">解鎖原因（必填）</label>
              <textarea
                value={clearReason}
                onChange={(e) => setClearReason(e.target.value)}
                rows={3}
                placeholder="例：客戶要求更改付款方式後重新確認費用"
                className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setClearReasonModalOpen(false)}
                disabled={isPending}
                className="h-[34px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={doConfirmClearSig}
                disabled={isPending || !clearReason.trim()}
                className="h-[34px] px-4 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#a50000] disabled:opacity-50"
              >
                {isPending ? "處理中⋯" : "確認解鎖（主管授權）"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* RP5 費用鎖定後修改申請 Modal */}
      {feeUnlockModalOpen ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-[20px]">📝</span>
              <div>
                <h3 className="text-[15px] font-semibold text-[#2C2C2A]">申請費用修改授權（RP5）</h3>
                <p className="text-[12px] text-[#5A5955] mt-0.5">
                  費用已簽名鎖定，需主管授權方可修改。核准後由主管點「主管解鎖」，再重新確認費用並補簽。
                </p>
              </div>
            </div>
            <div className="bg-[#FDF3E3] border border-[#F0C97E] rounded px-3 py-2 text-[12px] text-[#854F0B]">
              ⚠️ 此申請將寫入稽核紀錄，且通知主管審批。
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-[#9A9890] font-medium">修改原因（稽核必填）</label>
              <textarea
                value={feeUnlockNotes}
                onChange={(e) => setFeeUnlockNotes(e.target.value)}
                rows={3}
                placeholder="例：車主發現有項目遺漏，需加入維修明細後重新確認"
                className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setFeeUnlockModalOpen(false)}
                disabled={isPending}
                className="h-[34px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={doFeeUnlockRequest}
                disabled={isPending || !feeUnlockNotes.trim()}
                className="h-[34px] px-4 rounded text-[12.5px] font-medium bg-[#854F0B] text-white hover:bg-[#6b3f08] disabled:opacity-50"
              >
                {isPending ? "送出中⋯" : "送出申請"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
type EntrustForm = {
  is_entrusted: boolean;
  agent_name: string;
  relation: string;
  id_note: string;
  auth_method: "phone" | "line_screenshot" | "presystem";
};

/** 車主授權方式選項 */
const AUTH_METHOD_OPTIONS: { value: "phone" | "line_screenshot" | "presystem"; label: string; desc: string }[] = [
  { value: "phone", label: "現場電話向車主確認", desc: "SA 當面致電車主，口頭授權代取" },
  { value: "line_screenshot", label: "LINE 截圖授權", desc: "車主傳 LINE 訊息授權，SA 留存截圖" },
  { value: "presystem", label: "車主提前系統登記", desc: "車主已在系統登記指定代取人" },
];

function Step1({
  summary,
  lines,
  fenced,
  isPending,
  onRefresh,
  onChangeDiscount,
  onConfirm,
  entrustForm,
  setEntrustForm,
  onSaveEntrustment,
  agentSigImg,
  onAgentSign,
  onAgentReSign,
  addonAuthSigImg,
  addonAuthSigAt,
  onAddonAuthSign,
  onAddonAuthReSign,
  discountApprovalPending,
  discountPendingPct,
}: {
  summary: FeeSummary;
  lines: FeeLine[];
  fenced: boolean;
  isPending: boolean;
  onRefresh: () => void;
  onChangeDiscount: (pct: number) => void;
  onConfirm: () => void;
  entrustForm: EntrustForm;
  setEntrustForm: (f: EntrustForm) => void;
  onSaveEntrustment: () => void;
  // Step1B 委託取車：受託人電子簽名
  agentSigImg: string | null;
  onAgentSign: (dataUrl: string) => void;
  onAgentReSign: () => void;
  // RP2 ④ 追加授權簽名
  addonAuthSigImg: string | null;
  addonAuthSigAt: string | null;
  onAddonAuthSign: (dataUrl: string) => void;
  onAddonAuthReSign: () => void;
  // P7：折扣超限送審狀態
  discountApprovalPending?: boolean;
  discountPendingPct?: number | null;
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

      {/* P7：折扣超限送審中提示 */}
      {discountApprovalPending && (
        <div className="mt-3 pt-3 border-t border-[#EEECE6] bg-[#FDF3E3] border border-[#F0C97E] rounded-md px-3 py-2 flex items-center gap-2 text-[12.5px] text-[#854F0B]">
          <span className="material-symbols-outlined text-[16px]">pending</span>
          <span>
            折扣 <b>{discountPendingPct}%</b> 超出授權上限，已送主管審批中。主管核准後折扣才會生效，目前費用以<b>未折扣</b>顯示。
          </span>
        </div>
      )}

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#EEECE6] flex-wrap">
        <span className="text-[12.5px] text-[#5A5955]">折扣優惠</span>
        <select
          value={pct}
          onChange={(e) => onChangeDiscount(Number(e.target.value))}
          disabled={fenced || isPending || discountApprovalPending}
          className={`h-[30px] border rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:opacity-50 ${
            discountApprovalPending ? "border-[#F0C97E] bg-[#FDF3E3] text-[#854F0B]" : "border-[#D5D3CB]"
          }`}
        >
          {DISCOUNT_OPTIONS.map((o) => (
            <option key={o.pct} value={o.pct}>
              {o.label}
            </option>
          ))}
        </select>
        {discountApprovalPending && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-[#FDF3E3] text-[#854F0B] border border-[#F0C97E]">
            ⏳ 送審中
          </span>
        )}
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

      {/* 包F：委託取車授權（Step1B）*/}
      <div className="mt-3 pt-3 border-t border-[#EEECE6]">
        <label className="flex items-center gap-2 text-[12.5px] text-[#2C2C2A] cursor-pointer">
          <input
            type="checkbox"
            checked={entrustForm.is_entrusted}
            disabled={fenced || isPending}
            onChange={(e) =>
              setEntrustForm({ ...entrustForm, is_entrusted: e.target.checked })
            }
            className="w-4 h-4 accent-[#1A3A5C]"
          />
          <b>委託取車</b>：本次由<b>非車主本人</b>代為取車（需登記受託人）
        </label>
        {entrustForm.is_entrusted && (
          <div className="mt-2 bg-[#FDF3E3] border border-[#F0C97E] rounded p-3 space-y-3">
            {/* 授權方式 radio — 三選一（現場電話/LINE截圖/系統預登記） */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-[#854F0B]">車主授權方式 *</div>
              <div className="flex flex-col gap-1.5">
                {AUTH_METHOD_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-2 cursor-pointer rounded px-2 py-1.5 transition ${
                      entrustForm.auth_method === opt.value
                        ? "bg-[#FEF9EC] border border-[#F0C97E]"
                        : "hover:bg-[#FEF9EC]/50"
                    } ${fenced || isPending ? "opacity-60 pointer-events-none" : ""}`}
                  >
                    <input
                      type="radio"
                      name="entrustment_auth_method"
                      value={opt.value}
                      checked={entrustForm.auth_method === opt.value}
                      disabled={fenced || isPending}
                      onChange={() => setEntrustForm({ ...entrustForm, auth_method: opt.value })}
                      className="mt-0.5 accent-[#854F0B]"
                    />
                    <div>
                      <span className="text-[12.5px] font-medium text-[#854F0B]">{opt.label}</span>
                      <span className="text-[11px] text-[#9A9890] ml-1.5">{opt.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 受託人基本資料 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#854F0B]">受託人姓名 *</label>
                <input
                  value={entrustForm.agent_name}
                  disabled={fenced || isPending}
                  onChange={(e) => setEntrustForm({ ...entrustForm, agent_name: e.target.value })}
                  placeholder="代取人姓名"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#854F0B]">與車主關係</label>
                <input
                  value={entrustForm.relation}
                  disabled={fenced || isPending}
                  onChange={(e) => setEntrustForm({ ...entrustForm, relation: e.target.value })}
                  placeholder="例：配偶 / 同事 / 車行"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#854F0B]">證件 / 授權備註</label>
                <input
                  value={entrustForm.id_note}
                  disabled={fenced || isPending}
                  onChange={(e) => setEntrustForm({ ...entrustForm, id_note: e.target.value })}
                  placeholder="例：已核對身分證 / 車主電話授權"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white"
                />
              </div>
            </div>

            {/* 受託人電子簽名欄（代替車主現場確認） */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-[#854F0B]">受託人電子簽名（代取人親簽）</div>
              {agentSigImg ? (
                <div className="border border-[#F0C97E] rounded bg-white p-2 flex flex-col items-center gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={agentSigImg}
                    alt="受託人簽名"
                    className="w-full max-w-[360px] h-[90px] object-contain bg-white border border-[#F0C97E] rounded"
                  />
                  {!fenced && (
                    <button
                      type="button"
                      onClick={onAgentReSign}
                      disabled={isPending}
                      className="text-[11px] text-[#185FA5] hover:underline disabled:opacity-50"
                    >
                      清除重簽
                    </button>
                  )}
                </div>
              ) : fenced ? (
                <div className="border border-dashed border-[#D5D3CB] rounded p-2 text-center text-[12px] text-[#9A9890]">
                  未簽受託人授權
                </div>
              ) : (
                <div className={isPending ? "pointer-events-none opacity-60" : ""}>
                  <SignatureCanvas onSigned={onAgentSign} />
                </div>
              )}
            </div>
          </div>
        )}
        <div className="mt-2 flex justify-end">
          <button
            onClick={onSaveEntrustment}
            disabled={fenced || isPending || (entrustForm.is_entrusted && !entrustForm.agent_name.trim())}
            className="h-[28px] px-3 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存取車方式"}
          </button>
        </div>
      </div>

      {/* RP2 ④：追加項目授權客戶簽名 — 有追加項目時才顯示 */}
      {lines.some((l) => l.is_addon) && (
        <div className="mt-3 pt-3 border-t border-[#EEECE6] space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold text-[#854F0B]">
              ④ 追加項目客戶授權簽名
            </span>
            <span className="text-[11.5px] text-[#9A9890]">（費用含追加項目，需客戶另行簽名授權）</span>
            {addonAuthSigAt && (
              <span className="ml-auto text-[11px] text-[#0F6E56] whitespace-nowrap">
                ✅ {fmtDateTime(addonAuthSigAt)}
              </span>
            )}
          </div>
          {addonAuthSigImg ? (
            <div className="border border-[#1D9E75] rounded bg-[#E1F5EE] p-3 flex flex-col items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={addonAuthSigImg}
                alt="追加授權簽名"
                className="w-full max-w-[360px] h-[100px] object-contain bg-white border border-[#1D9E75] rounded"
              />
              {!fenced && (
                <button
                  type="button"
                  onClick={onAddonAuthReSign}
                  className="text-[11px] text-[#185FA5] hover:underline"
                >
                  重新簽名
                </button>
              )}
            </div>
          ) : fenced ? (
            <div className="border border-dashed border-[#D5D3CB] rounded p-3 text-center text-[12px] text-[#9A9890]">
              未簽追加授權
            </div>
          ) : (
            <div className={isPending ? "pointer-events-none opacity-60" : ""}>
              <SignatureCanvas onSigned={onAddonAuthSign} />
            </div>
          )}
        </div>
      )}

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
  signatureImg,
  fenced,
  isPending,
  onSign,
  onClear,
}: {
  payable: number;
  customerName: string | null;
  signedAt: string | null;
  signatureText: string | null;
  signatureImg: string | null;
  fenced: boolean;
  isPending: boolean;
  onSign: (dataUrl: string) => void;
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
          {signatureImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signatureImg}
              alt="車主簽名"
              className="w-full max-w-[420px] h-40 object-contain bg-white border border-[#1D9E75] rounded"
            />
          ) : (
            <div className="text-[26px] text-[#1A3A5C]" style={{ fontFamily: "cursive" }}>
              {signatureText ?? customerName ?? "—"}
            </div>
          )}
          <div className="text-[11px] text-[#0F6E56]">
            ✅ {fmtDateTime(signedAt)} · 電子簽名完成（防竄改）
          </div>
        </div>
      ) : fenced ? (
        <div className="w-full border-2 border-dashed border-[#D5D3CB] rounded-lg p-6 text-center text-[12px] text-[#9A9890]">
          此單已鎖定，無法簽名
        </div>
      ) : (
        <div className={isPending ? "pointer-events-none opacity-60" : ""}>
          <SignatureCanvas onSigned={onSign} />
        </div>
      )}
      <div className="text-[11px] text-[#9A9890] mt-2">
        * 電子簽名具有法律效力，簽名後系統自動記錄時間戳，不可修改
      </div>

      {signed && !fenced ? (
        <div className="mt-3 pt-3 border-t border-[#EEECE6] flex items-center gap-2 justify-end">
          <span className="text-[11px] text-[#854F0B]">⚠️ 清除簽名需主管授權，並記錄稽核日誌</span>
          <button
            onClick={onClear}
            disabled={isPending}
            className="h-[28px] px-3 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
          >
            主管解鎖清除簽名
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
  closeoutPdfUrl,
  pdfFetching,
  onFetchPdfUrl,
  nextServiceMileage,
  nextServiceDate,
  customerId,
  repairOrderId,
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
  /** RP4 Layer3：結帳憑證 PDF 下載 URL（signed URL）*/
  closeoutPdfUrl: string | null;
  pdfFetching: boolean;
  onFetchPdfUrl: () => void;
  /** 包F：下次保養推算值（關單後由 customer_vehicles 讀取） */
  nextServiceMileage: number | null;
  nextServiceDate: string | null;
  /** B19-01：投訴記錄入口用 */
  customerId: string | null;
  repairOrderId: string;
}) {
  const isClosed = status === "completed";
  return (
    <div className="space-y-3">
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
                {/* RP4 Layer3：結帳憑證 PDF 下載（有 URL 就直接開、沒有就觸發取 URL） */}
                {closeoutPdfUrl ? (
                  <a
                    href={closeoutPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-[36px] px-4 rounded text-[12.5px] inline-flex items-center gap-1.5 bg-[#EAF3DE] border border-[#C5DC9F] text-[#3B6D11] hover:bg-[#d6edbd]"
                    download
                  >
                    <span className="material-symbols-outlined text-[15px]">picture_as_pdf</span>
                    下載結帳憑證 PDF
                  </a>
                ) : (
                  <button
                    onClick={onFetchPdfUrl}
                    disabled={pdfFetching}
                    className="h-[36px] px-4 rounded text-[12.5px] inline-flex items-center gap-1.5 bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    title="取得結帳憑證 PDF 連結"
                  >
                    <span className="material-symbols-outlined text-[15px]">picture_as_pdf</span>
                    {pdfFetching ? "取得中⋯" : "結帳憑證 PDF"}
                  </button>
                )}
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

      {/* 下次保養提醒設定 UI（關單後顯示）— B19 Step4 規格 */}
      {isClosed && (nextServiceMileage != null || nextServiceDate != null) && (
        <SectionCard title="🔔 下次保養提醒">
          <div className="bg-[#EAF3DE] border border-[#C5DC9F] rounded p-3 space-y-2.5">
            <div className="text-[12.5px] font-semibold text-[#3B6D11]">
              系統已自動推算下次回廠資訊（已寫入人車檔案）
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-[12.5px]">
              {nextServiceMileage != null && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#5A5955] w-[100px] shrink-0">建議下次里程</span>
                  <span className="font-mono font-semibold text-[#1A3A5C]">
                    {nextServiceMileage.toLocaleString("en-US")} km
                  </span>
                </div>
              )}
              {nextServiceDate && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#5A5955] w-[100px] shrink-0">預估回廠日期</span>
                  <span className="font-semibold text-[#1A3A5C]">{nextServiceDate}</span>
                </div>
              )}
            </div>
            <div className="text-[11.5px] text-[#5A5955]">
              ✅ 已同步寫入人車檔案，CRM D+{150} 天回訪任務已建立
            </div>
          </div>
        </SectionCard>
      )}

      {/* B19-01：取車後投訴記錄入口（關單後才顯示）*/}
      {isClosed && (
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-[#2C2C2A]">取車後問題回報</div>
            <div className="text-[11.5px] text-[#9A9890]">
              工單關閉後如發現問題或客戶提出投訴，可至人車檔案補記
            </div>
          </div>
          <Link
            href={
              customerId
                ? `/parts/aftersales/customers/${customerId}#complaints`
                : `/parts/aftersales/customers?ro=${repairOrderId}`
            }
            className="h-[34px] px-4 rounded text-[12.5px] font-medium inline-flex items-center gap-1.5 bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[14px]">report_problem</span>
            新增取車後投訴記錄
          </Link>
        </div>
      )}
    </div>
  );
}

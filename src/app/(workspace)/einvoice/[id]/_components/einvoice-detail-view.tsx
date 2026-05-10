"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { voidInvoiceAction, allowanceInvoiceAction, printInvoiceAction } from "@/lib/einvoice/actions";

export type EInvoiceItem = { name: string; qty: number; unitPrice: number; amount: number };

export type EInvoiceFull = {
  id: string;
  brand_id: string;
  source_module: "pos" | "service" | "parts_sales" | "manual";
  source_id: string | null;
  source_ref: string | null;
  ecpay_invoice_no: string | null;
  ecpay_invoice_date: string | null;
  ecpay_random_number: string | null;
  ecpay_status: "pending" | "issued" | "failed" | "voided" | "allowanced";
  ecpay_error_msg: string | null;
  invoice_type: "b2c_personal" | "b2c_carrier" | "b2c_taxid" | "b2b" | "donation";
  carrier_type: string | null;
  carrier_code: string | null;
  tax_id: string | null;
  buyer_name: string | null;
  buyer_address: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  donation_code: string | null;
  total_amount: number;
  tax_amount: number;
  items: EInvoiceItem[];
  remark: string | null;
  issued_at: string | null;
  created_at: string;
};

export type AllowanceRow = {
  id: string;
  ecpay_allowance_no: string | null;
  total_amount: number;
  tax_amount: number;
  items: EInvoiceItem[];
  reason: string | null;
  status: "pending" | "issued" | "failed" | "invalid";
  ecpay_error_msg: string | null;
  notify_method: string | null;
  notify_target: string | null;
  issued_at: string | null;
  created_at: string;
};

export type VoidRow = {
  id: string;
  reason: string;
  voided_at: string;
  voided_by: string | null;
};

type Props = {
  einvoice:   EInvoiceFull;
  allowances: AllowanceRow[];
  voids:      VoidRow[];
  canVoid:        boolean;
  canAllowance:   boolean;
};

const TYPE_LABEL: Record<EInvoiceFull["invoice_type"], string> = {
  b2c_personal: "B2C 個人",
  b2c_carrier:  "B2C 載具",
  b2c_taxid:    "B2C 統編",
  b2b:          "B2B 公司",
  donation:     "B2C 捐贈",
};

const SOURCE_LABEL: Record<EInvoiceFull["source_module"], string> = {
  pos:         "POS 結帳",
  service:     "維修工單",
  parts_sales: "零件銷售",
  manual:      "手動補單",
};

const STATUS_LABEL: Record<EInvoiceFull["ecpay_status"], string> = {
  pending:    "待開立",
  issued:     "已開立",
  failed:     "開立失敗",
  voided:     "已作廢",
  allowanced: "已折讓",
};

const STATUS_CHIP: Record<EInvoiceFull["ecpay_status"], string> = {
  pending:    "bg-[#F2F2F2] text-[#6B6A68]",
  issued:     "bg-[#EAF3DE] text-[#3B6D11]",
  failed:     "bg-[#FDECEA] text-[#CC0000]",
  voided:     "bg-[#FDECEA] text-[#CC0000]",
  allowanced: "bg-[#FDF3E3] text-[#854F0B]",
};

function fmtNT(n: number): string {
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

type Tab = "items" | "allowances" | "voids" | "source";

export function EInvoiceDetailView({
  einvoice,
  allowances,
  voids,
  canVoid,
  canAllowance,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("items");
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [allowanceModalOpen, setAllowanceModalOpen] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  const isVoided      = einvoice.ecpay_status === "voided";
  const isFailed      = einvoice.ecpay_status === "failed";
  const isIssued      = einvoice.ecpay_status === "issued" || einvoice.ecpay_status === "allowanced";
  const allowedAmount = allowances
    .filter((a) => a.status === "issued")
    .reduce((sum, a) => sum + a.total_amount, 0);
  const remainingAmount = Math.max(0, einvoice.total_amount - allowedAmount);

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  const pillBase = "h-[30px] px-4 rounded-full text-[12px] inline-flex items-center";
  const pillBack = `${pillBase} bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm`;
  const pillEdit = `${pillBase} font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50`;
  const pillNew  = `${pillBase} font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50`;
  const pillDel  = `${pillBase} bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50`;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1. Breadcrumb + CRUD pill */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/einvoice" className="hover:text-[#185FA5]">電子發票</Link>
          <span>›</span>
          <Link href="/einvoice" className="hover:text-[#185FA5]">發票列表</Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">
            {einvoice.ecpay_invoice_no ?? einvoice.id.slice(0, 8)}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link href="/einvoice" className={pillBack}>← 返回列表</Link>
          {isIssued && einvoice.ecpay_invoice_no && (
            <ReprintButton
              einvoiceId={einvoice.id}
              invoiceNo={einvoice.ecpay_invoice_no}
              className={pillEdit}
              showBanner={showBanner}
            />
          )}
          {canAllowance && isIssued && remainingAmount > 0 && (
            <button
              type="button"
              onClick={() => setAllowanceModalOpen(true)}
              className={pillNew}
            >
              開折讓
            </button>
          )}
          {canVoid && isIssued && (
            <button
              type="button"
              onClick={() => setVoidModalOpen(true)}
              className={pillDel}
            >
              作廢
            </button>
          )}
        </div>
      </div>

      {/* 2. Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">{TYPE_LABEL[einvoice.invoice_type]}</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {einvoice.ecpay_invoice_no ?? "（尚未取得發票號碼）"}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${STATUS_CHIP[einvoice.ecpay_status]}`}>
                  {STATUS_LABEL[einvoice.ecpay_status]}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                  {SOURCE_LABEL[einvoice.source_module]}
                </span>
                {einvoice.source_ref && (
                  <span className="font-mono text-[#9A9890]">
                    {einvoice.source_ref}
                  </span>
                )}
                {einvoice.ecpay_random_number && (
                  <span className="font-mono text-[#5A5955]">隨機碼 {einvoice.ecpay_random_number}</span>
                )}
              </div>
            </div>
            {isFailed && einvoice.ecpay_error_msg && (
              <div className="px-3 py-2 rounded bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] text-[12px]">
                ✗ 開立失敗：{einvoice.ecpay_error_msg}
              </div>
            )}
            {allowedAmount > 0 && (
              <div className="px-3 py-2 rounded bg-[#FDF3E3] border border-amber-300 text-[#854F0B] text-[12px]">
                已折讓 {fmtNT(allowedAmount)}（餘額 {fmtNT(remainingAmount)}）
              </div>
            )}
            {isVoided && (
              <div className="px-3 py-2 rounded bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] text-[12px]">
                ✗ 此發票已作廢
              </div>
            )}
          </div>
          <div className="shrink-0 w-[200px] h-[120px] border border-[#EEECE6] rounded-lg bg-[#F8F7F4] flex flex-col items-center justify-center text-[12px] text-[#9A9890]">
            <div className="text-[26px] font-mono text-[#2C2C2A]">
              {fmtNT(einvoice.total_amount)}
            </div>
            <div className="mt-1">含稅總金額</div>
            <div className="text-[11px] mt-0.5">（含稅額 {fmtNT(einvoice.tax_amount)}）</div>
          </div>
        </div>
      </header>

      {/* 3. KV grid */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="發票號碼" mono value={einvoice.ecpay_invoice_no ?? "—"} />
          <Kv label="開立日期" value={einvoice.ecpay_invoice_date ?? "—"} />
          <Kv label="隨機碼" mono value={einvoice.ecpay_random_number ?? "—"} />
          <Kv label="發票類型" value={TYPE_LABEL[einvoice.invoice_type]} />
          <Kv label="來源模組" value={SOURCE_LABEL[einvoice.source_module]} />
          <Kv label="來源單號" mono value={einvoice.source_ref ?? "—"} />
          <Kv label="未稅金額" mono value={fmtNT(einvoice.total_amount - einvoice.tax_amount)} />
          <Kv label="稅額" mono value={fmtNT(einvoice.tax_amount)} />
          <Kv label="含稅金額" mono value={fmtNT(einvoice.total_amount)} />
        </div>
      </section>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 買方資訊</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          {einvoice.invoice_type === "b2c_carrier" ? (
            <Kv label="手機載具" mono value={einvoice.carrier_code ?? "—"} />
          ) : einvoice.invoice_type === "b2c_taxid" || einvoice.invoice_type === "b2b" ? (
            <>
              <Kv label="統一編號" mono value={einvoice.tax_id ?? "—"} />
              <Kv label="公司名稱" value={einvoice.buyer_name ?? "—"} />
              <Kv label="公司地址" value={einvoice.buyer_address ?? "—"} />
            </>
          ) : einvoice.invoice_type === "donation" ? (
            <Kv label="捐贈碼" mono value={einvoice.donation_code ?? "—"} />
          ) : (
            <Kv label="—" small value="個人發票（雲端發票自動歸戶）" />
          )}
          <Kv label="Email" small value={einvoice.buyer_email ?? "—"} />
          <Kv label="電話" small value={einvoice.buyer_phone ?? "—"} />
        </div>
      </section>

      {/* 4. Tabs */}
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          {([
            { id: "items",      label: `品項明細（${einvoice.items.length}）` },
            { id: "allowances", label: `折讓紀錄（${allowances.length}）` },
            { id: "voids",      label: `作廢紀錄（${voids.length}）` },
            { id: "source",     label: "來源連結" },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
                tab === t.id
                  ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                  : "text-[#5A5955] hover:bg-[#F8F7F4]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
        {tab === "items" && <ItemsTable items={einvoice.items} />}
        {tab === "allowances" && <AllowancesList allowances={allowances} />}
        {tab === "voids" && <VoidsList voids={voids} />}
        {tab === "source" && <SourceLink einvoice={einvoice} />}
      </div>

      {/* 5. Modals */}
      {voidModalOpen && (
        <VoidModal
          einvoice={einvoice}
          onClose={() => setVoidModalOpen(false)}
          onSubmit={async (reason) => {
            const result = await voidInvoiceAction(einvoice.id, reason);
            if (result.ok) {
              setVoidModalOpen(false);
              showBanner(true, "✓ 發票已成功作廢");
              router.refresh();
            } else {
              showBanner(false, `作廢失敗：${result.error}`);
            }
            return result.ok;
          }}
        />
      )}

      {allowanceModalOpen && (
        <AllowanceModal
          einvoice={einvoice}
          remainingAmount={remainingAmount}
          onClose={() => setAllowanceModalOpen(false)}
          onSubmit={async (input) => {
            const result = await allowanceInvoiceAction({
              einvoiceId: einvoice.id,
              ...input,
            });
            if (result.ok) {
              setAllowanceModalOpen(false);
              const msg = input.isOnline
                ? "✓ 已送出線上折讓申請，等買方在綠界平台確認"
                : `✓ 折讓單已開立${result.data.allowanceNo ? `（${result.data.allowanceNo}）` : ""}`;
              showBanner(true, msg);
              router.refresh();
            } else {
              showBanner(false, `折讓失敗：${result.error}`);
            }
            return result.ok;
          }}
        />
      )}

      {/* 6. Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}
    </main>
  );
}

// ─── Helpers ───────────────────────────────────────────────────

function ReprintButton({
  einvoiceId,
  invoiceNo,
  className,
  showBanner,
}: {
  einvoiceId: string;
  invoiceNo: string;
  className: string;
  showBanner: (ok: boolean, msg: string) => void;
}) {
  const [pending, startTransition] = useTransition();

  function reprint() {
    startTransition(async () => {
      const result = await printInvoiceAction(einvoiceId);
      if (!result.ok) {
        // 綠界 InvoicePrint 在 stage 環境常常因為發票早於 24h 內未上傳財政部而拒；
        // fallback 回複製號碼讓使用者知道發票確實存在
        await navigator.clipboard.writeText(invoiceNo);
        showBanner(false, `重印失敗（${result.error}），已複製發票號碼供查驗`);
        return;
      }
      // 開新分頁顯示綠界回的 HTML
      const win = window.open("", "_blank");
      if (!win) {
        showBanner(false, "瀏覽器封鎖了新分頁，請允許 pop-up 後再試");
        return;
      }
      win.document.open();
      win.document.write(result.data.html || `<pre>${invoiceNo}</pre>`);
      win.document.close();
      showBanner(true, `✓ 已開啟發票 ${invoiceNo} 列印視窗`);
    });
  }

  return (
    <button type="button" onClick={reprint} disabled={pending} className={className}>
      {pending ? "載入中⋯" : "重印"}
    </button>
  );
}

function Kv({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className={`${mono ? "font-mono" : ""} ${small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"}`}>
        {value}
      </div>
    </div>
  );
}

function ItemsTable({ items }: { items: EInvoiceItem[] }) {
  if (!items.length) {
    return <div className="text-[12px] text-[#9A9890] py-6 text-center">無品項資料</div>;
  }
  const total = items.reduce((s, i) => s + i.amount, 0);
  return (
    <table className="w-full text-[12px]">
      <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
        <tr>
          <th className="text-left font-medium py-2 px-3">品項</th>
          <th className="text-right font-medium py-2 px-3">數量</th>
          <th className="text-right font-medium py-2 px-3">單價</th>
          <th className="text-right font-medium py-2 px-3">小計</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => (
          <tr key={i} className="border-t border-[#F8F7F4]">
            <td className="py-2 px-3">{it.name}</td>
            <td className="py-2 px-3 text-right font-mono">{it.qty}</td>
            <td className="py-2 px-3 text-right font-mono">NT$ {it.unitPrice.toLocaleString()}</td>
            <td className="py-2 px-3 text-right font-mono">NT$ {it.amount.toLocaleString()}</td>
          </tr>
        ))}
        <tr className="border-t border-[#EEECE6] font-medium bg-[#FBFAF7]">
          <td colSpan={3} className="py-2 px-3 text-right text-[#9A9890]">總計（含稅）</td>
          <td className="py-2 px-3 text-right font-mono">NT$ {total.toLocaleString()}</td>
        </tr>
      </tbody>
    </table>
  );
}

function AllowancesList({ allowances }: { allowances: AllowanceRow[] }) {
  if (!allowances.length) {
    return <div className="text-[12px] text-[#9A9890] py-6 text-center">尚無折讓紀錄</div>;
  }
  return (
    <table className="w-full text-[12px]">
      <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
        <tr>
          <th className="text-left font-medium py-2 px-3">折讓號</th>
          <th className="text-right font-medium py-2 px-3">金額</th>
          <th className="text-left font-medium py-2 px-3">狀態</th>
          <th className="text-left font-medium py-2 px-3">原因</th>
          <th className="text-left font-medium py-2 px-3">建立時間</th>
        </tr>
      </thead>
      <tbody>
        {allowances.map((a) => (
          <tr key={a.id} className="border-t border-[#F8F7F4]">
            <td className="py-2 px-3 font-mono">{a.ecpay_allowance_no ?? <span className="text-[#9A9890]">—</span>}</td>
            <td className="py-2 px-3 text-right font-mono">NT$ {a.total_amount.toLocaleString()}</td>
            <td className="py-2 px-3">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${
                a.status === "issued" ? "bg-[#EAF3DE] text-[#3B6D11]"
                : a.status === "failed" ? "bg-[#FDECEA] text-[#CC0000]"
                : "bg-[#F2F2F2] text-[#6B6A68]"
              }`}>
                {a.status === "issued" ? "已生效" : a.status === "failed" ? "失敗" : a.status === "invalid" ? "已作廢" : "待處理"}
              </span>
              {a.status === "failed" && a.ecpay_error_msg && (
                <span className="ml-1 text-[11px] text-[#CC0000]">{a.ecpay_error_msg.slice(0, 30)}</span>
              )}
            </td>
            <td className="py-2 px-3 text-[#5A5955]">{a.reason ?? "—"}</td>
            <td className="py-2 px-3 text-[#9A9890] text-[11.5px]">
              {new Date(a.created_at).toLocaleString("zh-TW", { hour12: false })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VoidsList({ voids }: { voids: VoidRow[] }) {
  if (!voids.length) {
    return <div className="text-[12px] text-[#9A9890] py-6 text-center">尚無作廢紀錄</div>;
  }
  return (
    <table className="w-full text-[12px]">
      <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
        <tr>
          <th className="text-left font-medium py-2 px-3">作廢時間</th>
          <th className="text-left font-medium py-2 px-3">原因</th>
          <th className="text-left font-medium py-2 px-3">操作人</th>
        </tr>
      </thead>
      <tbody>
        {voids.map((v) => (
          <tr key={v.id} className="border-t border-[#F8F7F4]">
            <td className="py-2 px-3 text-[#5A5955]">
              {new Date(v.voided_at).toLocaleString("zh-TW", { hour12: false })}
            </td>
            <td className="py-2 px-3 text-[#2C2C2A]">{v.reason}</td>
            <td className="py-2 px-3 font-mono text-[#9A9890]">{v.voided_by ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SourceLink({ einvoice }: { einvoice: EInvoiceFull }) {
  if (einvoice.source_module === "pos" && einvoice.source_id) {
    return (
      <div className="text-[13px] text-[#5A5955] py-3">
        ▸ 來源 POS 交易：<span className="font-mono">{einvoice.source_ref}</span>
        <Link
          href="/pos/ledger"
          className="ml-2 px-2.5 h-[26px] inline-flex items-center rounded text-[11.5px] bg-white border border-[#D5D3CB] hover:border-[#9A9890]"
        >
          查看日記帳 →
        </Link>
      </div>
    );
  }
  return (
    <div className="text-[12px] text-[#9A9890] py-6 text-center">
      此發票為 {SOURCE_LABEL[einvoice.source_module]} 來源{einvoice.source_ref ? `，單號 ${einvoice.source_ref}` : ""}
    </div>
  );
}

// ─── Modals ────────────────────────────────────────────────────

function VoidModal({
  einvoice,
  onClose,
  onSubmit,
}: {
  einvoice: EInvoiceFull;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!reason.trim()) return;
    startTransition(async () => {
      await onSubmit(reason.trim());
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="px-5 py-4 border-b border-[#EEECE6]">
          <h2 className="text-[15px] font-semibold text-[#2C2C2A]">作廢發票</h2>
          <p className="text-[12px] text-[#9A9890] mt-0.5">
            發票號碼 <span className="font-mono">{einvoice.ecpay_invoice_no}</span> 將立即作廢，動作不可逆。
          </p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-[11px] text-[#9A9890] font-medium block mb-1">作廢原因（必填，20 字內）</label>
            <input
              type="text"
              maxLength={20}
              autoFocus
              className="w-full h-[34px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例：客戶取消訂單"
            />
            <div className="text-[11px] text-[#9A9890] mt-1">{reason.length}/20</div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-[32px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !reason.trim()}
            className="h-[32px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#a30000] disabled:opacity-50"
          >
            {pending ? "作廢中⋯" : "確認作廢"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AllowanceModal({
  einvoice,
  remainingAmount,
  onClose,
  onSubmit,
}: {
  einvoice: EInvoiceFull;
  remainingAmount: number;
  onClose: () => void;
  onSubmit: (input: {
    allowanceAmount: number;
    items: EInvoiceItem[];
    notifyMethod?: "email" | "sms" | "manual";
    notifyTarget?: string;
    reason?: string;
    isOnline?: boolean;
  }) => Promise<boolean>;
}) {
  // 預設折讓全部品項；使用者可改數量 / 金額
  const [items, setItems] = useState<EInvoiceItem[]>(einvoice.items.map((it) => ({ ...it })));
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState<"manual" | "email" | "sms">("manual");
  const [notifyTarget, setNotifyTarget] = useState(einvoice.buyer_email ?? "");
  const [isOnline, setIsOnline] = useState(false);    // 線上折讓開關（僅 B2C 可用）
  const [pending, startTransition] = useTransition();
  const supportsOnline = einvoice.invoice_type !== "b2b";

  const total = items.reduce((s, i) => s + i.amount, 0);
  const exceedsLimit = total > remainingAmount;

  function updateItemAmount(idx: number, amount: number) {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], amount };
      return next;
    });
  }

  function submit() {
    if (exceedsLimit || total <= 0) return;
    if (notify !== "manual" && !notifyTarget.trim()) return;
    if (isOnline && notify === "manual") return;     // 線上折讓必須通知買方確認
    startTransition(async () => {
      await onSubmit({
        allowanceAmount: total,
        items,
        notifyMethod:    notify,
        notifyTarget:    notify === "manual" ? undefined : notifyTarget.trim(),
        reason:          reason.trim() || undefined,
        isOnline,
      });
    });
  }

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-[#EEECE6]">
          <h2 className="text-[15px] font-semibold text-[#2C2C2A]">開立折讓單</h2>
          <p className="text-[12px] text-[#9A9890] mt-0.5">
            原發票 <span className="font-mono">{einvoice.ecpay_invoice_no}</span>，剩餘可折讓 NT$ {remainingAmount.toLocaleString()}
          </p>
        </div>
        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <div>
            <label className="text-[11px] text-[#9A9890] font-medium block mb-1">折讓品項與金額</label>
            <table className="w-full text-[12px] border border-[#EEECE6] rounded">
              <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
                <tr>
                  <th className="text-left font-medium py-1.5 px-2">品項</th>
                  <th className="text-right font-medium py-1.5 px-2 w-[80px]">數量</th>
                  <th className="text-right font-medium py-1.5 px-2 w-[100px]">單價</th>
                  <th className="text-right font-medium py-1.5 px-2 w-[120px]">折讓金額</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-t border-[#F8F7F4]">
                    <td className="py-1.5 px-2">{it.name}</td>
                    <td className="py-1.5 px-2 text-right font-mono">{it.qty}</td>
                    <td className="py-1.5 px-2 text-right font-mono">{it.unitPrice.toLocaleString()}</td>
                    <td className="py-1.5 px-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={it.amount}
                        className="w-full h-[26px] border border-[#D5D3CB] rounded px-1.5 text-[12.5px] text-right font-mono focus:border-[#185FA5] focus:outline-none"
                        value={it.amount}
                        onChange={(e) => updateItemAmount(i, Math.max(0, Number(e.target.value) || 0))}
                      />
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-[#EEECE6] font-medium bg-[#FBFAF7]">
                  <td colSpan={3} className="py-2 px-2 text-right text-[#9A9890]">折讓總計</td>
                  <td className={`py-2 px-2 text-right font-mono ${exceedsLimit ? "text-[#CC0000]" : "text-[#2C2C2A]"}`}>
                    NT$ {total.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
            {exceedsLimit && (
              <div className="text-[11px] text-[#CC0000] mt-1">
                折讓金額超過剩餘可折讓金額（NT$ {remainingAmount.toLocaleString()}）
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-[#9A9890] font-medium block mb-1">通知方式</label>
              <select
                className={`w-full ${inputClass}`}
                value={notify}
                onChange={(e) => setNotify(e.target.value as "manual" | "email" | "sms")}
              >
                <option value="manual">不通知（內部記帳）</option>
                <option value="email">Email 通知買方</option>
                <option value="sms">SMS 通知買方</option>
              </select>
            </div>
            {notify !== "manual" && (
              <div className="col-span-2">
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  {notify === "email" ? "通知 Email" : "通知手機"}
                </label>
                <input
                  type={notify === "email" ? "email" : "tel"}
                  className={`w-full ${inputClass}`}
                  value={notifyTarget}
                  onChange={(e) => setNotifyTarget(e.target.value)}
                  placeholder={notify === "email" ? "buyer@example.com" : "0912345678"}
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] text-[#9A9890] font-medium block mb-1">折讓原因（選填）</label>
            <input
              type="text"
              maxLength={200}
              className={`w-full ${inputClass}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例：商品瑕疵、客戶部分退貨"
            />
          </div>

          {supportsOnline && (
            <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded p-3 space-y-2">
              <label className="flex items-center gap-2 text-[12.5px] text-[#2C2C2A] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isOnline}
                  onChange={(e) => {
                    setIsOnline(e.target.checked);
                    if (e.target.checked && notify === "manual") setNotify("email");
                  }}
                  className="w-4 h-4"
                />
                <span className="font-medium">線上折讓（需買方在綠界平台確認）</span>
              </label>
              <p className="text-[11.5px] text-[#9A9890] leading-relaxed">
                走 <code className="font-mono">/B2CInvoice/AllowanceByCollegiate</code>，綠界會發 Email/SMS 給買方，
                買方在綠界平台確認後才會生效。狀態進「待確認」，綠界 callback 進來後會自動更新。
                <br />⚠️ 線上折讓必須通知買方（不可選「不通知」）。dev 環境綠界打不到 localhost callback，請部署到公網或用 ngrok 測試。
              </p>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-[32px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={
              pending || exceedsLimit || total <= 0 ||
              (notify !== "manual" && !notifyTarget.trim()) ||
              (isOnline && notify === "manual")
            }
            className="h-[32px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {pending ? "開立中⋯" : isOnline ? "送出（等買方確認）" : "確認開立折讓"}
          </button>
        </div>
      </div>
    </div>
  );
}

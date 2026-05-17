"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { issueInvoiceAction } from "@/lib/einvoice/actions";
import type { SalesOrderInvoicePrefill } from "@/domain/sales-orders";

type InvoiceMode = "b2c_personal" | "b2c_carrier" | "b2c_taxid" | "b2b" | "donation";

type LineItem = { name: string; qty: number; unitPrice: number };

/**
 * 來源無關的 prefill 殼。
 * - P1-#4（sales order 開票）→ source_module='manual'（B1 既有行為，不動）
 * - P1-#10（RO 結帳開票）→ source_module='service' + source_id=ro.id（本檔新增）
 */
export type ManualIssuePrefill = {
  source_module: "manual" | "service";
  source_id: string | null;
  source_ref: string;                       // 顯示用：訂單號 / RO 號 + 結帳號
  display_title: string;                    // header 顯示用
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_tax_id: string | null;
  total_amount: number | null;
  items: Array<{ name: string; qty: number; unitPrice: number }>;
  default_remark: string;
};

type Props = {
  /**
   * 兩種來源都接：
   * - SalesOrderInvoicePrefill：B1 (#4) 既有形狀
   * - ManualIssuePrefill：來源無關的新形狀（P1-#10 用）
   */
  prefill?: SalesOrderInvoicePrefill | ManualIssuePrefill | null;
};

function normalizePrefill(
  p: SalesOrderInvoicePrefill | ManualIssuePrefill | null | undefined,
): ManualIssuePrefill | null {
  if (!p) return null;
  // ManualIssuePrefill 已有 source_module 欄位 → 直接回
  if ("source_module" in p) return p;
  // SalesOrderInvoicePrefill → 對齊成 ManualIssuePrefill（B1 行為：source_module='manual'）
  return {
    source_module: "manual",
    source_id: p.id,
    source_ref: p.order_no,
    display_title: `為訂單 ${p.order_no} 開立發票`,
    customer_name: p.customer_name,
    customer_phone: p.customer_phone,
    customer_email: p.customer_email,
    customer_tax_id: p.customer_tax_id,
    total_amount: p.total_amount,
    items: p.items,
    default_remark: `來自訂單 ${p.order_no}`,
  };
}

const inputClass =
  "h-[34px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium block mb-1";

const MODE_TABS: Array<{ id: InvoiceMode; label: string; description: string }> = [
  { id: "b2c_personal", label: "B2C 個人",   description: "雲端發票（免填載具，自動歸戶）" },
  { id: "b2c_carrier",  label: "B2C 載具",   description: "手機條碼 /XXXXXXX（8 碼）" },
  { id: "b2c_taxid",    label: "B2C 統編",   description: "二聯式發票（含統編，個人經營）" },
  { id: "b2b",          label: "B2B 公司",   description: "三聯式（必填公司名與地址）" },
  { id: "donation",     label: "B2C 捐贈",   description: "捐贈碼（如 168001）" },
];

export function ManualIssueForm({ prefill: rawPrefill = null }: Props = {}) {
  const router = useRouter();
  const prefill = normalizePrefill(rawPrefill);
  // 預設 mode：若 prefill 帶有公司統編 → b2b、否則 b2c_personal
  const initialMode: InvoiceMode = prefill?.customer_tax_id ? "b2b" : "b2c_personal";
  const [mode, setMode] = useState<InvoiceMode>(initialMode);
  const [lines, setLines] = useState<LineItem[]>(
    prefill?.items && prefill.items.length > 0
      ? prefill.items.map((it) => ({ name: it.name, qty: it.qty, unitPrice: it.unitPrice }))
      : [{ name: "", qty: 1, unitPrice: 0 }],
  );
  const [carrierCode, setCarrierCode] = useState("");
  const [taxId,       setTaxId]       = useState(prefill?.customer_tax_id ?? "");
  const [buyerName,   setBuyerName]   = useState(prefill?.customer_name ?? "");
  const [buyerAddress,setBuyerAddress] = useState("");
  const [buyerEmail,  setBuyerEmail]  = useState(prefill?.customer_email ?? "");
  const [buyerPhone,  setBuyerPhone]  = useState(prefill?.customer_phone ?? "");
  const [donationCode,setDonationCode] = useState("");
  const [remark,      setRemark]       = useState(prefill?.default_remark ?? "");
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  const totalAmount = useMemo(
    () => lines.reduce((s, l) => s + l.qty * l.unitPrice, 0),
    [lines],
  );
  const taxAmount = Math.round(totalAmount * 5 / 105);
  const netAmount = totalAmount - taxAmount;

  function updateLine(idx: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { name: "", qty: 1, unitPrice: 0 }]);
  }
  function removeLine(idx: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function validate(): string | null {
    if (totalAmount <= 0) return "金額需大於 0";
    if (lines.some((l) => !l.name.trim())) return "所有品項都必須填寫名稱";
    if (lines.some((l) => l.qty <= 0)) return "所有品項數量需大於 0";
    if (mode === "b2c_carrier") {
      if (!/^\/[0-9A-Z+\-.]{7}$/.test(carrierCode)) return "手機載具格式不對（需 /XXXXXXX 共 8 碼）";
    }
    if (mode === "b2c_taxid" || mode === "b2b") {
      if (!/^\d{8}$/.test(taxId)) return "統一編號需為 8 位數字";
    }
    if (mode === "b2b") {
      if (!buyerName.trim())    return "B2B 必須填寫公司名稱";
      if (!buyerAddress.trim()) return "B2B 必須填寫公司地址";
    }
    if (mode === "donation" && !/^\d{3,7}$/.test(donationCode)) return "捐贈碼需為 3-7 位數字";
    return null;
  }

  function submit() {
    const err = validate();
    if (err) {
      setBanner({ ok: false, msg: err });
      return;
    }

    startTransition(async () => {
      const result = await issueInvoiceAction({
        invoiceType:  mode,
        totalAmount,
        items: lines.map((l) => ({
          name:      l.name.trim(),
          qty:       l.qty,
          unitPrice: l.unitPrice,
          amount:    l.qty * l.unitPrice,
        })),
        carrierCode:   mode === "b2c_carrier" ? carrierCode : undefined,
        taxId:         (mode === "b2c_taxid" || mode === "b2b") ? taxId : undefined,
        buyerName:     mode === "b2b" ? buyerName.trim()    : undefined,
        buyerAddress:  mode === "b2b" ? buyerAddress.trim() : undefined,
        buyerEmail:    buyerEmail.trim() || undefined,
        buyerPhone:    buyerPhone.trim() || undefined,
        donationCode:  mode === "donation" ? donationCode : undefined,
        sourceModule:  prefill?.source_module ?? "manual",
        sourceId:      prefill?.source_id ?? null,
        sourceRef:     prefill?.source_ref ?? null,
        remark:        remark.trim() || undefined,
      });

      if (result.ok) {
        setBanner({ ok: true, msg: `✓ 發票已開立${result.data.invoiceNo ? `（${result.data.invoiceNo}）` : ""}` });
        setTimeout(() => router.push(`/einvoice/${result.data.id}`), 800);
      } else {
        setBanner({ ok: false, msg: result.error });
      }
    });
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
        <Link href="/einvoice" className="hover:text-[#185FA5]">電子發票</Link>
        <span>›</span>
        <span className="text-[#5A5955]">手動開立</span>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#FDF3E3] text-[#854F0B] ml-1">
          建立模式
        </span>
      </div>

      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          {prefill ? prefill.display_title : "手動開立電子發票"}
        </h1>
        <p className="text-[12px] text-[#9A9890] mt-1">
          {prefill
            ? `已從來源帶入買方資料 / 品項 / 金額；可調整後送出。發票會關聯回此來源（source_module=${prefill.source_module}${prefill.source_id ? ` · source_id=${prefill.source_id.slice(0, 8)}…` : ""}）。`
            : "後台補單用，會以 source_module='manual' 寫入發票主檔。"}
        </p>
        {prefill && (
          <div className="mt-2 px-3 py-2 rounded bg-[#EAF4FB] border border-[#85B7EB] text-[12px] text-[#185FA5]">
            <span className="font-medium">已預填：</span>
            {prefill.customer_name ?? "（無客戶名）"}
            {prefill.customer_tax_id && <span> · 統編 {prefill.customer_tax_id}</span>}
            <span> · 共 {prefill.items.length} 品項 · NT$ {(prefill.total_amount ?? 0).toLocaleString()}</span>
          </div>
        )}
      </header>

      {/* Mode tabs */}
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          {MODE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id)}
              className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
                mode === t.id
                  ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                  : "text-[#5A5955] hover:bg-[#F8F7F4]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-4">
        <p className="text-[12px] text-[#9A9890]">
          {MODE_TABS.find((t) => t.id === mode)?.description}
        </p>

        {/* 買方資訊 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 買方資訊</span>
          </header>
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            {mode === "b2c_carrier" && (
              <div>
                <label className={labelClass}>手機載具碼（必填）</label>
                <input
                  type="text"
                  className={`w-full ${inputClass} font-mono`}
                  value={carrierCode}
                  onChange={(e) => setCarrierCode(e.target.value.toUpperCase())}
                  placeholder="/ABC1234"
                  maxLength={8}
                />
              </div>
            )}
            {(mode === "b2c_taxid" || mode === "b2b") && (
              <div>
                <label className={labelClass}>統一編號（必填）</label>
                <input
                  type="text"
                  className={`w-full ${inputClass} font-mono`}
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="12345678"
                  maxLength={8}
                />
              </div>
            )}
            {mode === "b2b" && (
              <>
                <div>
                  <label className={labelClass}>公司名稱（必填）</label>
                  <input
                    type="text"
                    className={`w-full ${inputClass}`}
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="○○股份有限公司"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>公司地址（必填）</label>
                  <input
                    type="text"
                    className={`w-full ${inputClass}`}
                    value={buyerAddress}
                    onChange={(e) => setBuyerAddress(e.target.value)}
                    placeholder="台北市中山區中山北路二段100號"
                  />
                </div>
              </>
            )}
            {mode === "donation" && (
              <div>
                <label className={labelClass}>捐贈碼（必填）</label>
                <input
                  type="text"
                  className={`w-full ${inputClass} font-mono`}
                  value={donationCode}
                  onChange={(e) => setDonationCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="168001（家扶基金會）"
                  maxLength={7}
                />
              </div>
            )}
            {mode === "b2c_personal" && (
              <div className="md:col-span-2 text-[12px] text-[#9A9890] py-2">
                個人發票無需填寫買方識別資訊，將開立雲端發票自動歸戶到財政部 e-invoice 平台。
              </div>
            )}

            <div>
              <label className={labelClass}>Email（選填，發票通知用）</label>
              <input
                type="email"
                className={`w-full ${inputClass}`}
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
                placeholder="buyer@example.com"
              />
            </div>
            <div>
              <label className={labelClass}>電話（選填）</label>
              <input
                type="tel"
                className={`w-full ${inputClass}`}
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                placeholder="0912345678"
              />
            </div>
          </div>
        </section>

        {/* 品項 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 品項</span>
            <button
              type="button"
              onClick={addLine}
              className="ml-auto h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              ＋ 新增品項
            </button>
          </header>
          <div className="px-4 py-3">
            <table className="w-full text-[12px]">
              <thead className="text-[11px] text-[#9A9890]">
                <tr>
                  <th className="text-left font-medium py-1.5">品名</th>
                  <th className="text-right font-medium py-1.5 w-[80px]">數量</th>
                  <th className="text-right font-medium py-1.5 w-[120px]">單價</th>
                  <th className="text-right font-medium py-1.5 w-[120px]">小計</th>
                  <th className="w-[40px]"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-[#F8F7F4]">
                    <td className="py-1.5 pr-2">
                      <input
                        type="text"
                        className={`w-full ${inputClass}`}
                        value={l.name}
                        onChange={(e) => updateLine(i, { name: e.target.value })}
                        placeholder="商品 / 服務名稱"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        min={1}
                        className={`w-full ${inputClass} text-right font-mono`}
                        value={l.qty}
                        onChange={(e) => updateLine(i, { qty: Math.max(1, Number(e.target.value) || 0) })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        min={0}
                        className={`w-full ${inputClass} text-right font-mono`}
                        value={l.unitPrice}
                        onChange={(e) => updateLine(i, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-[#2C2C2A]">
                      NT$ {(l.qty * l.unitPrice).toLocaleString()}
                    </td>
                    <td className="py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        disabled={lines.length === 1}
                        className="h-[26px] w-[26px] rounded text-[#CC0000] hover:bg-[#FDECEA] disabled:opacity-30"
                        title="刪除此列"
                      >
                        ✗
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-[12px] bg-[#FBFAF7]">
                <tr className="border-t border-[#EEECE6]">
                  <td colSpan={3} className="py-2 text-right text-[#9A9890]">未稅</td>
                  <td className="py-2 text-right font-mono">NT$ {netAmount.toLocaleString()}</td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={3} className="py-1 text-right text-[#9A9890]">稅額（5%）</td>
                  <td className="py-1 text-right font-mono">NT$ {taxAmount.toLocaleString()}</td>
                  <td></td>
                </tr>
                <tr className="border-t border-[#EEECE6] font-semibold">
                  <td colSpan={3} className="py-2 text-right text-[#2C2C2A]">含稅總計</td>
                  <td className="py-2 text-right font-mono text-[14px]">NT$ {totalAmount.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* 備註 */}
        <div>
          <label className={labelClass}>備註（選填，會印在發票備註欄）</label>
          <input
            type="text"
            className={`w-full ${inputClass}`}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="可填採購單號 / 客戶名 / 簡短說明"
            maxLength={200}
          />
        </div>

        {/* 動作 */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Link
            href="/einvoice"
            className="h-[34px] px-4 rounded-full text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] inline-flex items-center"
          >
            取消
          </Link>
          <button
            type="button"
            onClick={submit}
            disabled={pending || totalAmount <= 0}
            className="h-[34px] px-4 rounded-full text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {pending ? "開立中⋯" : "建立並開立"}
          </button>
        </div>
      </div>

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

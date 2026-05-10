"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type EInvoiceRow = {
  id: string;
  source_module: "pos" | "service" | "parts_sales" | "manual";
  source_ref: string | null;
  ecpay_invoice_no: string | null;
  ecpay_invoice_date: string | null;
  ecpay_status: "pending" | "issued" | "failed" | "voided" | "allowanced";
  invoice_type: "b2c_personal" | "b2c_carrier" | "b2c_taxid" | "b2b" | "donation";
  carrier_code: string | null;
  tax_id: string | null;
  buyer_name: string | null;
  total_amount: number;
  items: Array<{ name: string; qty: number; unitPrice: number; amount: number }>;
  issued_at: string | null;
  created_at: string;
};

export type EInvoiceFilters = {
  status: string;
  source: string;
  type: string;
  dateFrom: string;
  dateTo: string;
  q: string;
};

type Props = {
  rows: EInvoiceRow[];
  totalCount: number;
  canEdit: boolean;
  filters: EInvoiceFilters;
};

const STATUS_LABEL: Record<EInvoiceRow["ecpay_status"], string> = {
  pending:    "待開立",
  issued:     "已開立",
  failed:     "開立失敗",
  voided:     "已作廢",
  allowanced: "已折讓",
};

const STATUS_CHIP: Record<EInvoiceRow["ecpay_status"], string> = {
  pending:    "bg-[#F2F2F2] text-[#6B6A68]",
  issued:     "bg-[#EAF3DE] text-[#3B6D11]",
  failed:     "bg-[#FDECEA] text-[#CC0000]",
  voided:     "bg-[#F2F2F2] text-[#6B6A68]",
  allowanced: "bg-[#FDF3E3] text-[#854F0B]",
};

const SOURCE_LABEL: Record<EInvoiceRow["source_module"], string> = {
  pos:         "POS",
  service:     "維修",
  parts_sales: "零件銷售",
  manual:      "手動補單",
};

const TYPE_LABEL: Record<EInvoiceRow["invoice_type"], string> = {
  b2c_personal: "B2C 個人",
  b2c_carrier:  "B2C 載具",
  b2c_taxid:    "B2C 統編",
  b2b:          "B2B 公司",
  donation:     "B2C 捐贈",
};

function fmtNT(n: number): string {
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return s.slice(0, 10);
}

export function EInvoiceBoard({ rows, totalCount, canEdit, filters }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [local, setLocal] = useState(filters);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function applyFilters(next: Partial<EInvoiceFilters>) {
    const merged = { ...local, ...next };
    setLocal(merged);
    const params = new URLSearchParams();
    if (merged.status   !== "all") params.set("status",   merged.status);
    if (merged.source   !== "all") params.set("source",   merged.source);
    if (merged.type     !== "all") params.set("type",     merged.type);
    if (merged.dateFrom)           params.set("dateFrom", merged.dateFrom);
    if (merged.dateTo)             params.set("dateTo",   merged.dateTo);
    if (merged.q.trim())           params.set("q",        merged.q.trim());
    startTransition(() => {
      router.push(`/einvoice${params.size ? `?${params.toString()}` : ""}`);
    });
  }

  function reset() {
    const cleared = { status: "all", source: "all", type: "all", dateFrom: "", dateTo: "", q: "" };
    setLocal(cleared);
    startTransition(() => router.push("/einvoice"));
  }

  function onCopy(invoiceNo: string, id: string) {
    navigator.clipboard.writeText(invoiceNo).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1. Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">電子發票</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Sprint 0 · 跨來源彙整
        </span>
        <span className="text-[12px] text-[#9A9890]">
          POS / 維修 / 零件銷售 / 手動補單統一檢視
        </span>
      </header>

      {/* 3. Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>開立日（起）</label>
            <input
              type="date"
              className={inputClass}
              value={local.dateFrom}
              onChange={(e) => setLocal({ ...local, dateFrom: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>開立日（迄）</label>
            <input
              type="date"
              className={inputClass}
              value={local.dateTo}
              onChange={(e) => setLocal({ ...local, dateTo: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              className={inputClass}
              value={local.status}
              onChange={(e) => setLocal({ ...local, status: e.target.value })}
            >
              <option value="all">全部</option>
              <option value="issued">已開立</option>
              <option value="allowanced">已折讓</option>
              <option value="voided">已作廢</option>
              <option value="failed">開立失敗</option>
              <option value="pending">待開立</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>來源</label>
            <select
              className={inputClass}
              value={local.source}
              onChange={(e) => setLocal({ ...local, source: e.target.value })}
            >
              <option value="all">全部</option>
              <option value="pos">POS</option>
              <option value="service">維修</option>
              <option value="parts_sales">零件銷售</option>
              <option value="manual">手動補單</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>類型</label>
            <select
              className={inputClass}
              value={local.type}
              onChange={(e) => setLocal({ ...local, type: e.target.value })}
            >
              <option value="all">全部</option>
              <option value="b2c_personal">B2C 個人</option>
              <option value="b2c_carrier">B2C 載具</option>
              <option value="b2c_taxid">B2C 統編</option>
              <option value="b2b">B2B 公司</option>
              <option value="donation">B2C 捐贈</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className={labelClass}>關鍵字（號碼/單號/統編/公司名/載具）</label>
            <input
              type="text"
              className={inputClass}
              placeholder="JU11004940 / TX2026... / 28473932 ..."
              value={local.q}
              onChange={(e) => setLocal({ ...local, q: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") applyFilters({}); }}
            />
          </div>

          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => applyFilters({})}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
            {canEdit && (
              <Link
                href="/einvoice/issue"
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] inline-flex items-center"
              >
                ＋ 手動開立
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* 4. Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆發票
          {rows.length < totalCount && (
            <>（顯示 <b className="text-[#2C2C2A]">{rows.length}</b> 筆）</>
          )}
        </span>
      </div>

      {/* 5. Table */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
            <tr>
              <th className="text-left font-medium py-2 px-3">發票號碼</th>
              <th className="text-left font-medium py-2 px-3">開立日</th>
              <th className="text-left font-medium py-2 px-3">來源</th>
              <th className="text-left font-medium py-2 px-3">類型</th>
              <th className="text-left font-medium py-2 px-3">買方資訊</th>
              <th className="text-right font-medium py-2 px-3">含稅金額</th>
              <th className="text-left font-medium py-2 px-3">狀態</th>
              <th className="text-left font-medium py-2 px-3 w-[200px]">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-[12px] text-[#9A9890]">
                  目前沒有符合條件的發票。試試清除篩選或從 POS 結帳產生第一筆發票。
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                <td className="py-2 px-3 font-mono text-[#2C2C2A]">
                  {r.ecpay_invoice_no ?? <span className="text-[#9A9890]">—</span>}
                </td>
                <td className="py-2 px-3 text-[#5A5955]">{fmtDate(r.ecpay_invoice_date)}</td>
                <td className="py-2 px-3">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                    {SOURCE_LABEL[r.source_module]}
                  </span>
                  {r.source_ref && (
                    <span className="ml-1.5 text-[11px] text-[#9A9890] font-mono">
                      {r.source_ref}
                    </span>
                  )}
                </td>
                <td className="py-2 px-3">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">
                    {TYPE_LABEL[r.invoice_type]}
                  </span>
                </td>
                <td className="py-2 px-3 text-[#5A5955]">
                  {r.invoice_type === "b2b" || r.invoice_type === "b2c_taxid" ? (
                    <>
                      <span className="font-mono">{r.tax_id}</span>
                      {r.buyer_name && (
                        <span className="ml-1 text-[#9A9890]">·{r.buyer_name}</span>
                      )}
                    </>
                  ) : r.invoice_type === "b2c_carrier" ? (
                    <span className="font-mono text-[#5A5955]">{r.carrier_code}</span>
                  ) : (
                    <span className="text-[#9A9890]">—</span>
                  )}
                </td>
                <td className="py-2 px-3 text-right font-mono text-[#2C2C2A]">
                  {fmtNT(r.total_amount)}
                </td>
                <td className="py-2 px-3">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${STATUS_CHIP[r.ecpay_status]}`}>
                    {STATUS_LABEL[r.ecpay_status]}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <div className="flex gap-1.5">
                    <Link
                      href={`/einvoice/${r.id}`}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] inline-flex items-center"
                    >
                      詳情
                    </Link>
                    {r.ecpay_invoice_no && (
                      <button
                        type="button"
                        onClick={() => onCopy(r.ecpay_invoice_no!, r.id)}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                      >
                        {copiedId === r.id ? "已複製" : "複製號碼"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

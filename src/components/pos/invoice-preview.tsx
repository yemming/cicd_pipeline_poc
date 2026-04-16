"use client";

import { formatNTD, formatTaiwanDate, formatInvoiceNo, formatVatId } from "@/lib/pos/format";
import type { LineItem } from "@/lib/pos/pos-types";

export function InvoicePreview({
  invoiceNo,
  date,
  buyerName,
  buyerVatId,
  seller = "德拉拉行銷有限公司 (Ducati 台北旗艦)",
  sellerVatId = "54321876",
  lines,
  taxAmount,
  subtotal,
  total,
  note,
}: {
  invoiceNo: string;
  date: string;
  buyerName?: string;
  buyerVatId?: string;
  seller?: string;
  sellerVatId?: string;
  lines: LineItem[];
  taxAmount: number;
  subtotal: number;
  total: number;
  note?: string;
}) {
  const dateStr = formatTaiwanDate(date);
  const isB2B = !!buyerVatId;

  return (
    <div className="bg-white border border-slate-300 rounded-lg shadow-md overflow-hidden max-w-xl mx-auto">
      <div className="bg-indigo-50 border-b-2 border-indigo-200 px-6 py-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-indigo-500">Electronic Invoice</p>
          <p className="text-xl font-display font-extrabold text-indigo-900">電子發票證明聯</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-500">格式代號</p>
          <p className="text-sm font-bold text-slate-800">{isB2B ? "三聯式 25" : "二聯式 21"}</p>
        </div>
      </div>

      <div className="px-6 py-4 border-b border-dashed border-slate-300 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-[10px] text-slate-400 mb-0.5">發票號碼</p>
          <p className="font-display font-bold text-lg tabular-nums text-slate-900">
            {formatInvoiceNo(invoiceNo)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 mb-0.5">開立日期</p>
          <p className="font-bold text-slate-900">{dateStr}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 mb-0.5">賣方</p>
          <p className="font-medium text-slate-800">{seller}</p>
          <p className="text-[10px] text-slate-500 tabular-nums">統編 {formatVatId(sellerVatId)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 mb-0.5">買方</p>
          <p className="font-medium text-slate-800">{buyerName ?? "非買方"}</p>
          {buyerVatId && (
            <p className="text-[10px] text-slate-500 tabular-nums">
              統編 {formatVatId(buyerVatId)}
            </p>
          )}
        </div>
      </div>

      <div className="px-6 py-3">
        <table className="w-full text-xs">
          <thead className="border-b border-slate-200">
            <tr className="text-[10px] uppercase tracking-widest text-slate-500">
              <th className="py-2 text-left font-medium">品名</th>
              <th className="py-2 text-right font-medium w-12">數量</th>
              <th className="py-2 text-right font-medium w-20">單價</th>
              <th className="py-2 text-right font-medium w-24">金額</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="py-1.5 text-slate-800">{l.name}</td>
                <td className="py-1.5 text-right text-slate-600 tabular-nums">{l.quantity}</td>
                <td className="py-1.5 text-right text-slate-600 tabular-nums">
                  {l.unitPrice.toLocaleString()}
                </td>
                <td className="py-1.5 text-right text-slate-800 tabular-nums font-medium">
                  {l.subtotal.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-dashed border-slate-300 px-6 py-3 space-y-1 text-xs">
        <Row label="銷售額合計" value={subtotal} />
        <Row label="營業稅 (5%)" value={taxAmount} />
        <Row label="總計" value={total} bold />
        <Row label="應收金額" value={total} accent />
      </div>

      <div className="bg-slate-50 px-6 py-3 flex items-center justify-between border-t border-slate-200">
        <div className="flex flex-col gap-1">
          <div className="flex gap-0.5">
            {Array.from({ length: 50 }).map((_, i) => (
              <div
                key={i}
                className="w-[1px] bg-slate-800"
                style={{
                  height: `${12 + ((i * 13) % 16)}px`,
                  opacity: i % 3 === 0 ? 1 : 0.6,
                }}
              />
            ))}
          </div>
          <p className="text-[9px] text-slate-500">已上傳財政部 · 載具自動歸戶</p>
        </div>
        <div className="w-14 h-14 bg-white border-2 border-slate-800 grid grid-cols-6 grid-rows-6">
          {Array.from({ length: 36 }).map((_, i) => (
            <div
              key={i}
              className={(i * 17 + i % 3) % 2 === 0 ? "bg-slate-800" : ""}
            />
          ))}
        </div>
      </div>

      {note && (
        <div className="bg-amber-50 border-t border-amber-200 px-6 py-2 text-[11px] text-amber-700">
          <span className="material-symbols-outlined text-[12px] align-middle mr-1">info</span>
          {note}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: number;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${accent ? "text-indigo-700 font-bold" : "text-slate-500"}`}>{label}</span>
      <span
        className={`tabular-nums ${accent ? "text-indigo-700 font-bold text-sm" : bold ? "text-slate-900 font-bold" : "text-slate-700"}`}
      >
        {formatNTD(value)}
      </span>
    </div>
  );
}

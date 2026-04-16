"use client";

import { formatNTD, formatTaiwanDate } from "@/lib/pos/format";
import type { LineItem } from "@/lib/pos/pos-types";

export function ReceiptPreview({
  receiptNo,
  date,
  store = "Ducati 台北旗艦",
  clerk,
  lines,
  total,
  title = "收 據",
  note,
}: {
  receiptNo: string;
  date: string;
  store?: string;
  clerk?: string;
  lines: LineItem[];
  total: number;
  title?: string;
  note?: string;
}) {
  const dateStr = formatTaiwanDate(date, true);

  return (
    <div
      className="bg-white border border-slate-300 shadow-md font-mono mx-auto"
      style={{ width: "320px" }}
    >
      <div className="border-b border-dashed border-slate-400 p-4 text-center">
        <p className="text-base font-bold tracking-widest">{title}</p>
        <p className="text-[10px] text-slate-600 mt-1">{store}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">代辦費用 · 非銷售行為</p>
      </div>

      <div className="p-4 space-y-1 text-[11px] border-b border-dashed border-slate-400">
        <Row label="收據編號" value={receiptNo} />
        <Row label="開立時間" value={dateStr} />
        {clerk && <Row label="經手人" value={clerk} />}
      </div>

      <div className="p-4 text-[11px]">
        <div className="flex items-center justify-between font-bold pb-2 border-b border-slate-300">
          <span>項 目</span>
          <span>金 額</span>
        </div>
        <div className="py-2 space-y-1.5">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2">
              <span className="truncate">
                {l.name}
                {l.quantity > 1 ? ` ×${l.quantity}` : ""}
              </span>
              <span className="tabular-nums shrink-0">{l.subtotal.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t-2 border-black p-4 space-y-1">
        <div className="flex items-center justify-between font-bold text-base">
          <span>合 計</span>
          <span className="tabular-nums">{formatNTD(total)}</span>
        </div>
        <p className="text-[9px] text-slate-500 pt-1">以上金額為代收代付項目</p>
      </div>

      {note && (
        <div className="border-t border-dashed border-slate-400 p-3 text-[10px] text-slate-600">
          <p className="font-bold mb-0.5">備 註</p>
          <p>{note}</p>
        </div>
      )}

      <div className="p-3 text-center text-[9px] text-slate-500 border-t border-dashed border-slate-400">
        <p>本收據僅供帳務用，不得抵稅</p>
        <p className="mt-0.5">Ducati Taipei · 感謝您的惠顧</p>
        <div className="flex justify-center gap-0.5 mt-2">
          {Array.from({ length: 28 }).map((_, i) => (
            <div
              key={i}
              className="w-[2px] bg-slate-800"
              style={{ height: `${14 + ((i * 7) % 10)}px` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="text-slate-900 font-medium tabular-nums">{value}</span>
    </div>
  );
}

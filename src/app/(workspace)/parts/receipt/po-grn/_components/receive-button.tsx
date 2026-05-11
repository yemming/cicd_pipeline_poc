"use client";

import { useState, useTransition } from "react";
import { receiveStock } from "@/domain/receipts";

type Line = {
  id: string;
  line_no: number;
  item_id: string;
  item_name: string;
  item_code: string;
  qty_ordered: number;
  qty_received: number;
  unit_price: number;
};

type ReceiveLine = {
  po_line_id: string;
  qty_to_receive: number;
  bin_id: string;
  serial_no: string;
  batch_no: string;
};

export function ReceiveButton({
  po,
  lines,
  bins,
}: {
  po: { id: string; po_no: string; warehouse_id: string };
  lines: Line[];
  bins: Array<{ id: string; code: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>(
    lines.map((l) => ({
      po_line_id: l.id,
      qty_to_receive: l.qty_ordered - l.qty_received,
      bin_id: bins[0]?.id ?? "",
      serial_no: "",
      batch_no: "",
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const updateLine = (idx: number, patch: Partial<ReceiveLine>) =>
    setReceiveLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const handleSubmit = () => {
    setError(null);
    const toSubmit = receiveLines
      .map((rl, idx) => ({
        ...rl,
        line: lines[idx],
      }))
      .filter((rl) => rl.qty_to_receive > 0);
    if (toSubmit.length === 0) {
      setError("至少選一筆要收貨的明細(數量 > 0)");
      return;
    }
    startTransition(async () => {
      const result = await receiveStock({
        po_id: po.id,
        notes: notes || undefined,
        lines: toSubmit.map((rl) => ({
          po_line_id: rl.po_line_id,
          item_id: rl.line.item_id,
          qty_received: Number(rl.qty_to_receive),
          bin_id: rl.bin_id || undefined,
          serial_no: rl.serial_no || undefined,
          batch_no: rl.batch_no || undefined,
          unit_cost: rl.line.unit_price,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-7 px-3 bg-[#0F6E56] hover:bg-[#0a513f] text-white text-[12px] font-medium rounded"
      >
        執行收貨 →
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setOpen(false);
          }}
        >
          <div
            className={`bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col ${
              isPending ? "pointer-events-none opacity-90" : ""
            }`}
          >
            <div className="px-5 py-3 border-b border-[#EEECE6] flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-bold text-[#1A1917]">採購入庫</h2>
                <p className="text-[11px] text-[#6B6A68]">
                  PO <span className="font-mono">{po.po_no}</span> · 建立 GR 單 + 產生 stock_items
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="text-[#6B6A68] hover:text-[#1A1917] text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4 overflow-y-auto flex-1">
              <fieldset disabled={isPending}>
                <div className="space-y-2">
                  {lines.map((line, idx) => {
                    const remaining = line.qty_ordered - line.qty_received;
                    const rl = receiveLines[idx];
                    return (
                      <div key={line.id} className="border border-[#EEECE6] rounded p-2.5">
                        <div className="flex items-baseline gap-2 mb-1.5">
                          <span className="text-[10px] text-[#9A9890]">#{line.line_no}</span>
                          <span className="font-medium text-[12px]">{line.item_name}</span>
                          <span className="text-[10px] text-[#9A9890] font-mono">{line.item_code}</span>
                          <span className="ml-auto text-[11px] text-[#854F0B]">未收 {remaining} 件</span>
                        </div>
                        <div className="grid grid-cols-12 gap-2">
                          <input
                            type="number"
                            min={0}
                            max={remaining}
                            value={rl.qty_to_receive}
                            onChange={(e) =>
                              updateLine(idx, { qty_to_receive: Number(e.target.value) || 0 })
                            }
                            className="col-span-2 h-7 px-2 border border-[#D8D6CF] rounded text-[12px] text-right"
                            placeholder="收貨數"
                          />
                          <select
                            value={rl.bin_id}
                            onChange={(e) => updateLine(idx, { bin_id: e.target.value })}
                            className="col-span-4 h-7 px-2 border border-[#D8D6CF] rounded text-[11px]"
                          >
                            <option value="">(不指定庫位)</option>
                            {bins.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.code}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={rl.serial_no}
                            onChange={(e) => updateLine(idx, { serial_no: e.target.value })}
                            placeholder="序列號(選填)"
                            className="col-span-3 h-7 px-2 border border-[#D8D6CF] rounded text-[11px]"
                          />
                          <input
                            type="text"
                            value={rl.batch_no}
                            onChange={(e) => updateLine(idx, { batch_no: e.target.value })}
                            placeholder="批號(選填)"
                            className="col-span-3 h-7 px-2 border border-[#D8D6CF] rounded text-[11px]"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4">
                  <label className="block text-[11px] font-semibold text-[#4A4945] mb-1">收貨備註</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full px-2 py-1.5 border border-[#D8D6CF] rounded text-[12px]"
                    placeholder="如:司機/送貨車牌/驗收人..."
                  />
                </div>

                {error && (
                  <div className="mt-3 text-[12px] text-[#CC0000] bg-[#FDECEA] border border-[#FDB8B5] rounded px-2.5 py-1.5">
                    {error}
                  </div>
                )}
              </fieldset>
            </div>

            <div className="px-5 py-3 border-t border-[#EEECE6] flex items-center justify-end gap-2 bg-[#FAFAF9]">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="h-8 px-3 text-[12px] text-[#6B6A68] hover:text-[#1A1917] disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="h-8 px-4 bg-[#0F6E56] hover:bg-[#0a513f] text-white text-[12px] font-medium rounded disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                {isPending && (
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {isPending ? "收貨中⋯" : "確認收貨並產生 GR"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

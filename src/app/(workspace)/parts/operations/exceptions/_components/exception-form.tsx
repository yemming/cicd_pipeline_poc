"use client";

import { useState, useTransition } from "react";

import { exceptionMoveAction } from "@/lib/parts/actions";
import type { Item, Warehouse } from "@/lib/parts/types";

type Line = { item_id: string; qty: number; unit_cost: number };

export function ExceptionForm({ warehouses, items }: { warehouses: Warehouse[]; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([{ item_id: "", qty: 0, unit_cost: 0 }]);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function onSubmit() {
    setResult(null);
    const valid = lines.filter((l) => l.item_id && l.qty > 0).map((l) => ({
      item_id: l.item_id,
      qty: Number(l.qty),
      unit_cost: Number(l.unit_cost) || 0,
    }));
    if (valid.length === 0) {
      setResult({ ok: false, msg: "至少需要一筆有效明細" });
      return;
    }
    startTransition(async () => {
      const res = await exceptionMoveAction({ direction, warehouse_id: warehouseId, reason, lines: valid });
      if (res.ok) {
        setResult({ ok: true, msg: `✓ ${res.data.doc_no} 已 post` });
        setOpen(false);
        setLines([{ item_id: "", qty: 0, unit_cost: 0 }]);
        setReason("");
      } else {
        setResult({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div className="space-y-2">
      {!open && (
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-[13px] font-semibold rounded">
          <span className="material-symbols-outlined text-[16px]">priority_high</span>
          建例外出入庫單
        </button>
      )}
      {result && (
        <div className={`rounded-md border px-3 py-1.5 text-[13px] ${result.ok ? "border-[#79F2C0] bg-[#E3FCEF] text-[#006644]" : "border-[#FFBDAD] bg-[#FFEBE6] text-[#BF2600]"}`}>
          {result.msg}
        </div>
      )}
      {open && (
        <section className="border border-[#DFE1E6] rounded-md p-4 bg-[#FAFBFC] space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">方向 *</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value as "in" | "out")} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]">
                <option value="in">in 例外入庫</option>
                <option value="out">out 例外出庫</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">倉庫 *</label>
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]">
                {warehouses.map((w) => (<option key={w.id} value={w.id}>{w.code} ・ {w.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">原因 *</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} disabled={pending}
                placeholder="例：客退處理 / 轉用"
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]" />
            </div>
          </div>
          <div className="space-y-2">
            <header className="flex items-center justify-between">
              <h3 className="text-[12px] font-bold text-[#42526E]">明細（{lines.length}）</h3>
              <button type="button" onClick={() => setLines((p) => [...p, { item_id: "", qty: 0, unit_cost: 0 }])} disabled={pending}
                className="px-2 py-1 text-[12px] border border-[#0052CC] text-[#0052CC] rounded">+ 行</button>
            </header>
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <select value={l.item_id} onChange={(e) => setLines((p) => p.map((x, i) => i === idx ? { ...x, item_id: e.target.value } : x))} disabled={pending}
                  className="col-span-7 px-2 py-1.5 border border-[#DFE1E6] rounded text-[12px]">
                  <option value="">— 料號 —</option>
                  {items.map((i) => (<option key={i.id} value={i.id}>{i.code} · {i.name}</option>))}
                </select>
                <input type="number" step="any" min="0" value={l.qty}
                  onChange={(e) => setLines((p) => p.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value) || 0 } : x))}
                  disabled={pending} placeholder="qty"
                  className="col-span-2 px-2 py-1.5 border border-[#DFE1E6] rounded text-[12px] text-right" />
                <input type="number" step="any" min="0" value={l.unit_cost}
                  onChange={(e) => setLines((p) => p.map((x, i) => i === idx ? { ...x, unit_cost: Number(e.target.value) || 0 } : x))}
                  disabled={pending} placeholder="單價"
                  className="col-span-2 px-2 py-1.5 border border-[#DFE1E6] rounded text-[12px] text-right" />
                <button type="button" onClick={() => setLines((p) => p.filter((_, i) => i !== idx))} disabled={pending || lines.length === 1}
                  className="col-span-1 text-[#BF2600] disabled:opacity-30">✕</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t border-[#DFE1E6]">
            <button type="button" onClick={onSubmit} disabled={pending || !reason || !warehouseId}
              className="px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white text-[13px] font-semibold rounded">
              {pending ? "處理中…" : `確認 ${direction === "in" ? "入庫" : "出庫"}`}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={pending}
              className="px-4 py-2 text-[13px] text-[#42526E]">取消</button>
          </div>
        </section>
      )}
    </div>
  );
}

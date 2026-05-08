"use client";

import { useState, useTransition } from "react";

import { adjustStockManualAction } from "@/lib/parts/actions";
import type { Item, Warehouse } from "@/lib/parts/types";

type Line = { item_id: string; qty_diff: number; unit_cost: number; notes: string };

export function AdjustForm({ warehouses, items }: { warehouses: Warehouse[]; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([{ item_id: "", qty_diff: 0, unit_cost: 0, notes: "" }]);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function addLine() {
    setLines((p) => [...p, { item_id: "", qty_diff: 0, unit_cost: 0, notes: "" }]);
  }
  function updateLine(idx: number, key: keyof Line, val: string | number) {
    setLines((p) => p.map((l, i) => (i === idx ? { ...l, [key]: val } : l)));
  }
  function removeLine(idx: number) {
    setLines((p) => p.filter((_, i) => i !== idx));
  }

  function onSubmit() {
    setResult(null);
    const valid = lines
      .filter((l) => l.item_id && l.qty_diff !== 0)
      .map((l) => ({
        item_id: l.item_id,
        qty_diff: Number(l.qty_diff),
        unit_cost: Number(l.unit_cost) || 0,
        notes: l.notes || undefined,
      }));
    if (valid.length === 0) {
      setResult({ ok: false, msg: "至少需要一筆有 item + qty_diff !== 0 的明細" });
      return;
    }
    startTransition(async () => {
      const res = await adjustStockManualAction({
        warehouse_id: warehouseId,
        reason,
        lines: valid,
      });
      if (res.ok) {
        setResult({ ok: true, msg: `✓ ${res.data.adj_no} 已 post` });
        setOpen(false);
        setLines([{ item_id: "", qty_diff: 0, unit_cost: 0, notes: "" }]);
        setReason("");
      } else {
        setResult({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div className="space-y-2">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-[13px] font-semibold rounded"
        >
          <span className="material-symbols-outlined text-[16px]">tune</span>
          手動調整庫存
        </button>
      )}
      {result && (
        <div className={`rounded-md border px-3 py-1.5 text-[13px] ${result.ok ? "border-[#79F2C0] bg-[#E3FCEF] text-[#006644]" : "border-[#FFBDAD] bg-[#FFEBE6] text-[#BF2600]"}`}>
          {result.msg}
        </div>
      )}
      {open && (
        <section className="border border-[#DFE1E6] rounded-md p-4 bg-[#FAFBFC] space-y-3">
          <div className="grid grid-cols-2 gap-3">
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
                placeholder="例：破損下架 / 找到漏盤"
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]" />
            </div>
          </div>
          <div className="space-y-2">
            <header className="flex items-center justify-between">
              <h3 className="text-[12px] font-bold text-[#42526E]">調整明細（{lines.length}）</h3>
              <button type="button" onClick={addLine} disabled={pending}
                className="px-2 py-1 text-[12px] border border-[#0052CC] text-[#0052CC] rounded">+ 行</button>
            </header>
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <select value={l.item_id} onChange={(e) => updateLine(idx, "item_id", e.target.value)} disabled={pending}
                  className="col-span-5 px-2 py-1.5 border border-[#DFE1E6] rounded text-[12px]">
                  <option value="">— 料號 —</option>
                  {items.map((i) => (<option key={i.id} value={i.id}>{i.code} · {i.name}</option>))}
                </select>
                <input type="number" step="any" value={l.qty_diff}
                  onChange={(e) => updateLine(idx, "qty_diff", Number(e.target.value) || 0)}
                  disabled={pending} placeholder="qty 差"
                  className="col-span-2 px-2 py-1.5 border border-[#DFE1E6] rounded text-[12px] text-right" />
                <input type="number" step="any" min="0" value={l.unit_cost}
                  onChange={(e) => updateLine(idx, "unit_cost", Number(e.target.value) || 0)}
                  disabled={pending} placeholder="單價"
                  className="col-span-2 px-2 py-1.5 border border-[#DFE1E6] rounded text-[12px] text-right" />
                <input value={l.notes} onChange={(e) => updateLine(idx, "notes", e.target.value)}
                  disabled={pending} placeholder="備註"
                  className="col-span-2 px-2 py-1.5 border border-[#DFE1E6] rounded text-[12px]" />
                <button type="button" onClick={() => removeLine(idx)} disabled={pending || lines.length === 1}
                  className="col-span-1 text-[#BF2600] disabled:opacity-30">✕</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t border-[#DFE1E6]">
            <button type="button" onClick={onSubmit} disabled={pending || !reason || !warehouseId}
              className="px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white text-[13px] font-semibold rounded">
              {pending ? "調整中…" : "確認調整 + Post"}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={pending}
              className="px-4 py-2 text-[13px] text-[#42526E]">取消</button>
          </div>
        </section>
      )}
    </div>
  );
}

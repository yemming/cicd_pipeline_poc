"use client";

import { useState, useTransition } from "react";

import { upsertStockThresholdAction } from "@/lib/parts/actions";
import type { Item, Warehouse } from "@/lib/parts/types";

export function ThresholdForm({ warehouses, items }: { warehouses: Warehouse[]; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [itemId, setItemId] = useState("");
  const [minStock, setMinStock] = useState(0);
  const [reorderPoint, setReorderPoint] = useState(0);
  const [maxStock, setMaxStock] = useState(0);
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function onSubmit() {
    setResult(null);
    startTransition(async () => {
      const res = await upsertStockThresholdAction({
        warehouse_id: warehouseId,
        item_id: itemId,
        min_stock: Number(minStock),
        reorder_point: Number(reorderPoint),
        max_stock: maxStock > 0 ? Number(maxStock) : undefined,
        alert_priority: priority,
      });
      if (res.ok) {
        setResult({ ok: true, msg: "✓ 水位已設定 / 更新" });
        setOpen(false);
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
          <span className="material-symbols-outlined text-[16px]">water_drop</span>
          設定水位
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
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">倉庫 *</label>
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]">
                {warehouses.map((w) => (<option key={w.id} value={w.id}>{w.code}</option>))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">料件 *</label>
              <select value={itemId} onChange={(e) => setItemId(e.target.value)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]">
                <option value="">— 選 —</option>
                {items.map((i) => (<option key={i.id} value={i.id}>{i.code} · {i.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">最低水位 *</label>
              <input type="number" step="any" min="0" value={minStock} onChange={(e) => setMinStock(Number(e.target.value) || 0)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px] text-right" />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">補貨點 *</label>
              <input type="number" step="any" min="0" value={reorderPoint} onChange={(e) => setReorderPoint(Number(e.target.value) || 0)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px] text-right" />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">最高水位</label>
              <input type="number" step="any" min="0" value={maxStock} onChange={(e) => setMaxStock(Number(e.target.value) || 0)} disabled={pending}
                placeholder="0=不限"
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px] text-right" />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">告警優先序</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]">
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t border-[#DFE1E6]">
            <button type="button" onClick={onSubmit} disabled={pending || !warehouseId || !itemId}
              className="px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white text-[13px] font-semibold rounded">
              {pending ? "儲存中…" : "Upsert 水位"}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={pending}
              className="px-4 py-2 text-[13px] text-[#42526E]">取消</button>
          </div>
        </section>
      )}
    </div>
  );
}

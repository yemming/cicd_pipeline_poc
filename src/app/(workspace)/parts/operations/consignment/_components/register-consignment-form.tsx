"use client";

import { useState, useTransition } from "react";

import { registerConsignmentAction } from "@/lib/parts/actions";
import type { Item, Supplier, Warehouse } from "@/lib/parts/types";

export function RegisterConsignmentForm({
  warehouses,
  suppliers,
  items,
}: {
  warehouses: Warehouse[];
  suppliers: Supplier[];
  items: Item[];
}) {
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [itemId, setItemId] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [qty, setQty] = useState(0);
  const [unitCost, setUnitCost] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function onSubmit() {
    setResult(null);
    startTransition(async () => {
      const res = await registerConsignmentAction({
        supplier_id: supplierId,
        item_id: itemId,
        warehouse_id: warehouseId,
        initial_qty: Number(qty),
        unit_cost: Number(unitCost) || undefined,
        start_date: startDate,
        end_date: endDate,
        notes: notes || undefined,
      });
      if (res.ok) {
        setResult({ ok: true, msg: `✓ ${res.data.con_no} 已登記` });
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
          <span className="material-symbols-outlined text-[16px]">all_inbox</span>
          登記寄存
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
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">供應商 *</label>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]">
                {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.code} ・ {s.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">料件 *</label>
              <select value={itemId} onChange={(e) => setItemId(e.target.value)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]">
                <option value="">— 選 —</option>
                {items.map((i) => (<option key={i.id} value={i.id}>{i.code} · {i.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">倉庫 *</label>
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]">
                {warehouses.map((w) => (<option key={w.id} value={w.id}>{w.code}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">數量 *</label>
              <input type="number" step="any" min="0" value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px] text-right" />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">單價</label>
              <input type="number" step="any" min="0" value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value) || 0)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px] text-right" />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">起 / 迄日 *</label>
              <div className="flex gap-1">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={pending}
                  className="flex-1 px-2 py-2 border border-[#DFE1E6] rounded text-[12px]" />
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={pending}
                  className="flex-1 px-2 py-2 border border-[#DFE1E6] rounded text-[12px]" />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-bold text-[#172B4D] mb-1">備註</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending}
              className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]" />
          </div>
          <div className="flex gap-2 pt-2 border-t border-[#DFE1E6]">
            <button type="button" onClick={onSubmit} disabled={pending || !supplierId || !itemId || !warehouseId || !endDate || qty <= 0}
              className="px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white text-[13px] font-semibold rounded">
              {pending ? "登記中…" : "確認登記"}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={pending}
              className="px-4 py-2 text-[13px] text-[#42526E]">取消</button>
          </div>
        </section>
      )}
    </div>
  );
}

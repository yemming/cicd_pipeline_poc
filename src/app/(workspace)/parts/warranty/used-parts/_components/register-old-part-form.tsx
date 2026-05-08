"use client";

import { useState, useTransition } from "react";

import { registerOldPartAction } from "@/lib/parts/actions";
import type { Item, Warehouse } from "@/lib/parts/types";

export function RegisterOldPartForm({
  warehouses,
  items,
}: {
  warehouses: Warehouse[];
  items: Item[];
}) {
  const [open, setOpen] = useState(false);
  const [wcNo, setWcNo] = useState("");
  const [itemId, setItemId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [serialNo, setSerialNo] = useState("");
  const [vin, setVin] = useState("");
  const [expiry, setExpiry] = useState("");
  const [disposalAction, setDisposalAction] = useState<
    "return_oem" | "return_agent" | "destroy_onsite" | "recycle" | "retain" | "pending"
  >("pending");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function onSubmit() {
    setResult(null);
    startTransition(async () => {
      const res = await registerOldPartAction({
        wc_no: wcNo,
        item_id: itemId,
        warehouse_id: warehouseId || undefined,
        serial_no: serialNo || undefined,
        vin: vin || undefined,
        expiry_date: expiry || undefined,
        disposal_action: disposalAction,
        notes: notes || undefined,
      });
      if (res.ok) {
        setResult({ ok: true, msg: "✓ 已登記入庫" });
        setOpen(false);
        setWcNo("");
        setSerialNo("");
        setVin("");
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
          <span className="material-symbols-outlined text-[16px]">recycling</span>
          登記舊件入庫
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
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">舊件單號 *</label>
              <input value={wcNo} onChange={(e) => setWcNo(e.target.value)} disabled={pending}
                placeholder="例：WC-20260508-001"
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]" />
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
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">序號</label>
              <input value={serialNo} onChange={(e) => setSerialNo(e.target.value)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]" />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">VIN</label>
              <input value={vin} onChange={(e) => setVin(e.target.value)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]" />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">暫存倉</label>
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]">
                <option value="">— 不指定 —</option>
                {warehouses.map((w) => (<option key={w.id} value={w.id}>{w.code}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">處置截止</label>
              <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]" />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">處置方式</label>
              <select value={disposalAction} onChange={(e) => setDisposalAction(e.target.value as typeof disposalAction)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]">
                <option value="pending">pending 待定</option>
                <option value="return_oem">return_oem 退原廠</option>
                <option value="return_agent">return_agent 退代理</option>
                <option value="destroy_onsite">destroy_onsite 現場銷毀</option>
                <option value="recycle">recycle 回收</option>
                <option value="retain">retain 留存</option>
              </select>
            </div>
            <div className="col-span-3">
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">備註</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]" />
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t border-[#DFE1E6]">
            <button type="button" onClick={onSubmit} disabled={pending || !wcNo || !itemId}
              className="px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white text-[13px] font-semibold rounded">
              {pending ? "登記中…" : "登記入庫"}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={pending}
              className="px-4 py-2 text-[13px] text-[#42526E]">取消</button>
          </div>
        </section>
      )}
    </div>
  );
}

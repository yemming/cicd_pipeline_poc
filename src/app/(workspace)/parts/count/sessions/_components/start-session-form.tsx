"use client";

import { useState, useTransition } from "react";

import { startCountSessionAction } from "@/lib/parts/actions";
import type { Warehouse } from "@/lib/parts/types";

type Plan = { id: string; plan_name: string; warehouse_id: string };

export function StartSessionForm({
  warehouses,
  plans,
}: {
  warehouses: Warehouse[];
  plans: Plan[];
}) {
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function onSubmit() {
    setResult(null);
    startTransition(async () => {
      const res = await startCountSessionAction({
        plan_id: planId || undefined,
        warehouse_id: warehouseId,
      });
      if (res.ok) {
        setResult({
          ok: true,
          msg: `✓ 已啟動 ${res.data.ct_no}（${res.data.total_lines} 行待盤）`,
        });
        setOpen(false);
        setPlanId("");
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
          <span className="material-symbols-outlined text-[16px]">play_arrow</span>
          啟動新盤點
        </button>
      )}
      {result && (
        <div
          className={`rounded-md border px-3 py-1.5 text-[13px] ${
            result.ok
              ? "border-[#79F2C0] bg-[#E3FCEF] text-[#006644]"
              : "border-[#FFBDAD] bg-[#FFEBE6] text-[#BF2600]"
          }`}
        >
          {result.msg}
        </div>
      )}
      {open && (
        <section className="border border-[#DFE1E6] rounded-md p-4 bg-[#FAFBFC] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">
                倉庫 <span className="text-[#BF2600]">*</span>
              </label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px] focus:outline-none focus:border-[#0052CC]"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} ・ {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">關聯計畫</label>
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px] focus:outline-none focus:border-[#0052CC]"
              >
                <option value="">— 不關聯 —</option>
                {plans
                  .filter((p) => !warehouseId || p.warehouse_id === warehouseId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.plan_name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <p className="text-[12px] text-[#6B778C]">
            啟動會把該倉當下 status=&apos;available&apos; 的 stock_items 拍 snapshot 為 qty_system，
            建 inventory_counts (status=&apos;counting&apos;) + lines 等實盤輸入。
          </p>
          <div className="flex gap-2 pt-2 border-t border-[#DFE1E6]">
            <button
              type="button"
              onClick={onSubmit}
              disabled={pending || !warehouseId}
              className="px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white text-[13px] font-semibold rounded"
            >
              {pending ? "啟動中…" : "啟動 session"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="px-4 py-2 text-[13px] text-[#42526E] hover:text-[#172B4D]"
            >
              取消
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

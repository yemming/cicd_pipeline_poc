"use client";

import { useState, useTransition } from "react";

import { createCountPlanAction } from "@/lib/parts/actions";
import type { Warehouse } from "@/lib/parts/types";

export function NewPlanForm({ warehouses }: { warehouses: Warehouse[] }) {
  const [open, setOpen] = useState(false);
  const [planName, setPlanName] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [planType, setPlanType] = useState<
    "cycle" | "full" | "spot" | "abc_a" | "abc_b" | "abc_c"
  >("cycle");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function onSubmit() {
    setResult(null);
    startTransition(async () => {
      const res = await createCountPlanAction({
        plan_name: planName,
        warehouse_id: warehouseId,
        plan_type: planType,
      });
      if (res.ok) {
        setResult({ ok: true, msg: "✓ 已建立" });
        setPlanName("");
        setOpen(false);
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
          <span className="material-symbols-outlined text-[16px]">add</span>
          新增盤點計畫
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
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">
                計畫名稱 <span className="text-[#BF2600]">*</span>
              </label>
              <input
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="例：信義主倉月底盤點"
                disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px] focus:outline-none focus:border-[#0052CC]"
              />
            </div>
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
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">類型</label>
              <select
                value={planType}
                onChange={(e) => setPlanType(e.target.value as typeof planType)}
                disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px] focus:outline-none focus:border-[#0052CC]"
              >
                <option value="cycle">cycle 循環盤點</option>
                <option value="full">full 全盤</option>
                <option value="spot">spot 抽盤</option>
                <option value="abc_a">abc_a A 類</option>
                <option value="abc_b">abc_b B 類</option>
                <option value="abc_c">abc_c C 類</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t border-[#DFE1E6]">
            <button
              type="button"
              onClick={onSubmit}
              disabled={pending || !planName || !warehouseId}
              className="px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white text-[13px] font-semibold rounded"
            >
              {pending ? "建立中…" : "建立計畫"}
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

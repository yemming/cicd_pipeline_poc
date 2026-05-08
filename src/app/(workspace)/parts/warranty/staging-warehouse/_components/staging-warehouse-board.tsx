"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateStagingRulesAction } from "@/lib/parts-setup/staging-warehouse-actions";

export type StagingWarehouse = {
  id: string;
  code: string;
  name: string;
  type: string | null;
  is_active: boolean | null;
  address: string | null;
  notes: string | null;
};

export type StagingRules = {
  brand_id: string;
  isolate_from_sellable: boolean;
  exclude_from_alerts: boolean;
  exclude_from_count: boolean;
  allow_temp_borrow: boolean;
  alert_days_first: number;
  alert_days_escalate: number;
  cost_calc_method: string;
};

type Banner = { ok: boolean; msg: string } | null;

export function StagingWarehouseBoard({
  warehouses,
  rules,
  canEdit,
}: {
  warehouses: StagingWarehouse[];
  rules: StagingRules | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const r: StagingRules = rules ?? {
    brand_id: "",
    isolate_from_sellable: true,
    exclude_from_alerts: true,
    exclude_from_count: true,
    allow_temp_borrow: false,
    alert_days_first: 60,
    alert_days_escalate: 90,
    cost_calc_method: "pending_until_approved",
  };

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const update = (patch: Record<string, unknown>) => {
    startTransition(async () => {
      const res = await updateStagingRulesAction(patch);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <main className={`px-6 py-6 space-y-4 ${lockedClass}`}>
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">暫存倉設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          11.3
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          保固暫存倉、庫存隔離規則、超期告警
        </span>
      </header>

      {banner ? (
        <div
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      <div className="px-3 py-2 rounded bg-[#EBF3FF] border border-[#B5D4F4] text-[12px] text-[#1A3A5C]">
        🏗 暫存倉是專門存放保固舊件的隔離倉庫，不計入可售庫存，也不參與盤點差異計算。
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-md border border-[#E1E1E1] bg-white">
          <header className="px-4 py-3 border-b border-[#E1E1E1] flex items-center text-[13px] font-semibold">
            🏗 暫存倉列表
            <span className="ml-auto text-[11px] text-[#666]">
              共 {warehouses.length} 個
            </span>
          </header>
          <div className="p-4 space-y-2 text-[12.5px]">
            {warehouses.length === 0 ? (
              <div className="text-[12px] text-[#888]">
                目前尚未建立暫存倉。請至「倉庫庫區庫位設定」新增 type=&quot;warranty&quot; 的倉庫。
              </div>
            ) : (
              warehouses.map((w) => (
                <div
                  key={w.id}
                  className="px-3 py-2 rounded border border-[#E1E1E1] flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold">{w.name}</div>
                    <div className="text-[11px] text-[#888]">
                      {`代碼：${w.code} ｜ 類型：${w.type ?? "—"} ｜ ${
                        w.address ?? w.notes ?? ""
                      }`}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] ${
                      w.is_active
                        ? "bg-[#EAF3DE] text-[#3B6D11]"
                        : "bg-[#F0F0F0] text-[#444]"
                    }`}
                  >
                    {w.is_active ? "啟用" : "停用"}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-md border border-[#E1E1E1] bg-white">
          <header className="px-4 py-3 border-b border-[#E1E1E1] text-[13px] font-semibold">
            ⚙️ 暫存倉規則設定
          </header>
          <div className="p-4 space-y-3 text-[12.5px]">
            <div className="text-[11px] font-semibold text-[#666] uppercase">
              庫存隔離設定
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={r.isolate_from_sellable}
                onChange={(e) => update({ isolate_from_sellable: e.target.checked })}
              />
              暫存倉庫存不計入門店可售庫存
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={r.exclude_from_alerts}
                onChange={(e) => update({ exclude_from_alerts: e.target.checked })}
              />
              不參與缺貨告警計算
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={r.exclude_from_count}
                onChange={(e) => update({ exclude_from_count: e.target.checked })}
              />
              不參與定期盤點作業
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={r.allow_temp_borrow}
                onChange={(e) => update({ allow_temp_borrow: e.target.checked })}
              />
              允許臨時借調至主倉（需主管核准）
            </label>

            <div className="text-[11px] font-semibold text-[#666] uppercase mt-3">
              超期告警設定
            </div>
            <div className="flex items-center gap-2">
              <span>存放超過</span>
              <input
                type="number"
                min={1}
                disabled={!canEdit}
                value={r.alert_days_first}
                onChange={(e) =>
                  update({ alert_days_first: Number(e.target.value) })
                }
                className="w-16 h-7 border border-[#DADADA] rounded text-center"
              />
              <span>天，發送告警</span>
            </div>
            <div className="flex items-center gap-2">
              <span>超過</span>
              <input
                type="number"
                min={1}
                disabled={!canEdit}
                value={r.alert_days_escalate}
                onChange={(e) =>
                  update({ alert_days_escalate: Number(e.target.value) })
                }
                className="w-16 h-7 border border-[#DADADA] rounded text-center"
              />
              <span>天，升級主管告警</span>
            </div>

            <div className="text-[11px] font-semibold text-[#666] uppercase mt-3">
              庫存成本計算方式
            </div>
            <select
              disabled={!canEdit}
              value={r.cost_calc_method}
              onChange={(e) => update({ cost_calc_method: e.target.value })}
              className="h-8 border border-[#DADADA] rounded px-2 w-full"
            >
              <option value="pending_until_approved">暫不計算成本（待原廠核准後沖銷）</option>
              <option value="freeze_at_inbound">移入時按進貨成本凍結</option>
            </select>
          </div>
        </section>
      </div>
    </main>
  );
}

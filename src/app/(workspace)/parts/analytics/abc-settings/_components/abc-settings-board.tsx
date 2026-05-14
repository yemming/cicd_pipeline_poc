"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateAbcSettingsAction } from "@/lib/parts-setup/abc-settings-actions";

export type AbcConfig = {
  id: string | null;
  brand_id: string;
  recalc_trigger: string | null;
  rolling_period_months: number | null;
  threshold_a_pct: number | null;
  threshold_b_pct: number | null;
  count_freq_a_days: number | null;
  count_freq_b_days: number | null;
  count_freq_c_days: number | null;
  safety_stock_days_a: number | null;
  safety_stock_days_b: number | null;
  safety_stock_days_c: number | null;
  new_item_default_class: string | null;
  new_item_grace_months: number | null;
  last_recalc_at: string | null;
  is_active: boolean | null;
};

type Banner = { ok: boolean; msg: string } | null;

export function AbcSettingsBoard({
  config,
  canEdit,
}: {
  config: AbcConfig | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const update = (patch: Record<string, unknown>) => {
    startTransition(async () => {
      const res = await updateAbcSettingsAction(patch);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const c: AbcConfig = config ?? {
    id: null,
    brand_id: "",
    recalc_trigger: "monthly_first",
    rolling_period_months: 12,
    threshold_a_pct: 70,
    threshold_b_pct: 90,
    count_freq_a_days: 30,
    count_freq_b_days: 90,
    count_freq_c_days: 180,
    safety_stock_days_a: 14,
    safety_stock_days_b: 21,
    safety_stock_days_c: 30,
    new_item_default_class: "C",
    new_item_grace_months: 3,
    last_recalc_at: null,
    is_active: true,
  };
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const num = (v: number | null | undefined, fb: number) => Number(v ?? fb);

  return (
    <main className={`px-6 py-6 space-y-4 ${lockedClass}`}>
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">ABC 分類設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          12.2
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          門檻、重算週期、盤點頻率、安全庫存天數
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-md border border-[#E1E1E1] bg-white">
          <header className="px-4 py-3 border-b border-[#E1E1E1] text-[13px] font-semibold">
            🔢 分類門檻
          </header>
          <div className="p-4 space-y-3 text-[12.5px]">
            <label className="grid grid-cols-2 gap-3 items-center">
              <span>A 類累計占比 ≤</span>
              <input
                type="number"
                min={1}
                max={99}
                disabled={!canEdit}
                value={num(c.threshold_a_pct, 70)}
                onChange={(e) => update({ threshold_a_pct: Number(e.target.value) })}
                className="h-8 border border-[#DADADA] rounded px-2 text-right"
              />
            </label>
            <label className="grid grid-cols-2 gap-3 items-center">
              <span>B 類累計占比 ≤</span>
              <input
                type="number"
                min={1}
                max={100}
                disabled={!canEdit}
                value={num(c.threshold_b_pct, 90)}
                onChange={(e) => update({ threshold_b_pct: Number(e.target.value) })}
                className="h-8 border border-[#DADADA] rounded px-2 text-right"
              />
            </label>
            <label className="grid grid-cols-2 gap-3 items-center">
              <span>滾動期間（月）</span>
              <input
                type="number"
                min={1}
                max={36}
                disabled={!canEdit}
                value={num(c.rolling_period_months, 12)}
                onChange={(e) =>
                  update({ rolling_period_months: Number(e.target.value) })
                }
                className="h-8 border border-[#DADADA] rounded px-2 text-right"
              />
            </label>
            <label className="grid grid-cols-2 gap-3 items-center">
              <span>重算觸發</span>
              <select
                disabled={!canEdit}
                value={c.recalc_trigger ?? "monthly_first"}
                onChange={(e) => update({ recalc_trigger: e.target.value })}
                className="h-8 border border-[#DADADA] rounded px-2"
              >
                <option value="manual">手動</option>
                <option value="monthly_first">每月 1 號</option>
                <option value="quarterly">每季</option>
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-md border border-[#E1E1E1] bg-white">
          <header className="px-4 py-3 border-b border-[#E1E1E1] text-[13px] font-semibold">
            📅 盤點頻率（天）
          </header>
          <div className="p-4 space-y-3 text-[12.5px]">
            {[
              { k: "count_freq_a_days", lab: "A 類", fb: 30 },
              { k: "count_freq_b_days", lab: "B 類", fb: 90 },
              { k: "count_freq_c_days", lab: "C 類", fb: 180 },
            ].map((f) => (
              <label key={f.k} className="grid grid-cols-2 gap-3 items-center">
                <span>{f.lab}</span>
                <input
                  type="number"
                  min={1}
                  disabled={!canEdit}
                  value={num((c as Record<string, unknown>)[f.k] as number | null, f.fb)}
                  onChange={(e) => update({ [f.k]: Number(e.target.value) })}
                  className="h-8 border border-[#DADADA] rounded px-2 text-right"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-[#E1E1E1] bg-white">
          <header className="px-4 py-3 border-b border-[#E1E1E1] text-[13px] font-semibold">
            🛡 安全庫存天數
          </header>
          <div className="p-4 space-y-3 text-[12.5px]">
            {[
              { k: "safety_stock_days_a", lab: "A 類", fb: 14 },
              { k: "safety_stock_days_b", lab: "B 類", fb: 21 },
              { k: "safety_stock_days_c", lab: "C 類", fb: 30 },
            ].map((f) => (
              <label key={f.k} className="grid grid-cols-2 gap-3 items-center">
                <span>{f.lab}</span>
                <input
                  type="number"
                  min={0}
                  disabled={!canEdit}
                  value={num((c as Record<string, unknown>)[f.k] as number | null, f.fb)}
                  onChange={(e) => update({ [f.k]: Number(e.target.value) })}
                  className="h-8 border border-[#DADADA] rounded px-2 text-right"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-[#E1E1E1] bg-white">
          <header className="px-4 py-3 border-b border-[#E1E1E1] text-[13px] font-semibold">
            🆕 新品預設
          </header>
          <div className="p-4 space-y-3 text-[12.5px]">
            <label className="grid grid-cols-2 gap-3 items-center">
              <span>預設分類</span>
              <select
                disabled={!canEdit}
                value={c.new_item_default_class ?? "C"}
                onChange={(e) => update({ new_item_default_class: e.target.value })}
                className="h-8 border border-[#DADADA] rounded px-2"
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </label>
            <label className="grid grid-cols-2 gap-3 items-center">
              <span>觀察期（月）</span>
              <input
                type="number"
                min={1}
                max={12}
                disabled={!canEdit}
                value={num(c.new_item_grace_months, 3)}
                onChange={(e) => update({ new_item_grace_months: Number(e.target.value) })}
                className="h-8 border border-[#DADADA] rounded px-2 text-right"
              />
            </label>
            <div className="text-[11px] text-[#888] mt-2">
              {c.last_recalc_at
                ? `最近一次重算：${c.last_recalc_at.slice(0, 16).replace("T", " ")}`
                : "尚未執行重算"}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

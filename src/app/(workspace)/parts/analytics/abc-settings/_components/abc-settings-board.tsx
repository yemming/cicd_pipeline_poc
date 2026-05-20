"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateAbcSettingsAction } from "@/lib/parts-setup/abc-settings-actions";
import { applyAbcAction, previewAbcAction } from "@/lib/parts-analytics/abc-actions";
import {
  ABC_METRIC_OPTIONS,
  DEFAULT_ABC_THRESHOLDS,
  type AbcClass,
  type AbcConfig,
  type AbcMetric,
  type AbcSimulationResult,
} from "@/domain/parts-abc.constants";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization/KpiCard";
import { DonutChart } from "@/components/charts/DonutChart";

// 重新 export 讓既有 import 路徑（src/domain/analytics.ts）若有殘留也不會壞
export type { AbcConfig } from "@/domain/parts-abc.constants";

type Banner = { ok: boolean; msg: string } | null;

const CLASS_DONUT_COLORS: Record<AbcClass, string> = {
  A: "#B91C1C", // tone-red-700
  B: "#B45309", // tone-amber-700
  C: "#1D4ED8", // tone-blue-700
};

const CLASS_CHIP_CLASS: Record<AbcClass, string> = {
  A: "bg-[#FEE2E2] text-[#B91C1C] border-[#FCA5A5]",
  B: "bg-[#FEF3C7] text-[#B45309] border-[#FCD34D]",
  C: "bg-[#DBEAFE] text-[#1D4ED8] border-[#93C5FD]",
};

function ClassChip({ cls }: { cls: AbcClass }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-semibold border ${CLASS_CHIP_CLASS[cls]}`}
    >
      {cls}
    </span>
  );
}

function fmtAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(0);
}

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
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 從 config 拉初值，沒值就用 default。simulation 用本地 state、不打 DB 也不打 DB。
  const c: AbcConfig =
    config ??
    ({
      id: null,
      brand_id: "",
      recalc_trigger: "monthly_first",
      rolling_period_months: 12,
      threshold_a_pct: DEFAULT_ABC_THRESHOLDS.a_percentile,
      threshold_b_pct: DEFAULT_ABC_THRESHOLDS.b_percentile,
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
    } satisfies AbcConfig);

  const num = (v: number | null | undefined, fb: number) => Number(v ?? fb);

  // 預覽參數（不直接綁 c — 讓 user 可以調整、再按「預覽」/「儲存」）
  const [aPct, setAPct] = useState<number>(num(c.threshold_a_pct, 80));
  const [bPct, setBPct] = useState<number>(num(c.threshold_b_pct, 95));
  const [metric, setMetric] = useState<AbcMetric>(DEFAULT_ABC_THRESHOLDS.metric);
  const [simulation, setSimulation] = useState<AbcSimulationResult | null>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  /** 把舊版「點一下就 auto-save」改成參數設定走 updateAbcSettingsAction，不變。 */
  const persistField = (patch: Record<string, unknown>) => {
    startTransition(async () => {
      const res = await updateAbcSettingsAction(patch);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const doPreview = () => {
    if (bPct <= aPct) {
      showBanner({ ok: false, msg: "B 類門檻必須大於 A 類" });
      return;
    }
    startTransition(async () => {
      const res = await previewAbcAction({ a_percentile: aPct, b_percentile: bPct, metric });
      if (res.ok) {
        setSimulation(res.data);
        if (res.data.before.total.count === 0) {
          showBanner({ ok: false, msg: "目前 brand 沒有任何 ABC 重算結果可供預覽，請先到「ABC 分類報表」執行重算" });
        }
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const doApply = () => {
    setConfirmOpen(false);
    startTransition(async () => {
      const res = await applyAbcAction({ a_percentile: aPct, b_percentile: bPct, metric });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已套用，影響 ${res.data.affected} 個品項` });
        setSimulation(null);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const beforeDonut = useMemo(() => {
    const src = simulation?.before;
    if (!src) return [];
    return (["A", "B", "C"] as AbcClass[]).map((k) => ({
      name: k,
      value: src[k].count,
      color: CLASS_DONUT_COLORS[k],
    }));
  }, [simulation]);
  const afterDonut = useMemo(() => {
    const src = simulation?.after;
    if (!src) return [];
    return (["A", "B", "C"] as AbcClass[]).map((k) => ({
      name: k,
      value: src[k].count,
      color: CLASS_DONUT_COLORS[k],
    }));
  }, [simulation]);

  const changeCols: DataGridColumn<AbcSimulationResult["changes"][number]>[] = [
    {
      id: "item_code",
      header: "品號",
      width: 140,
      hideable: false,
      cell: (r) => (
        <span className="font-mono font-semibold text-[#1A3A5C]">{r.item_code}</span>
      ),
      exportValue: (r) => r.item_code,
      sortValue: (r) => r.item_code,
    },
    {
      id: "item_name",
      header: "品名",
      cell: (r) => r.item_name,
      exportValue: (r) => r.item_name,
      sortValue: (r) => r.item_name,
    },
    {
      id: "from",
      header: "原分類",
      width: 90,
      align: "left",
      cell: (r) => <ClassChip cls={r.from} />,
      exportValue: (r) => r.from,
      sortValue: (r) => r.from,
    },
    {
      id: "arrow",
      header: "",
      width: 40,
      align: "left",
      sortable: false,
      cell: () => <span className="text-[#9A9890] text-[12px]">→</span>,
      exportValue: () => "→",
    },
    {
      id: "to",
      header: "新分類",
      width: 90,
      cell: (r) => <ClassChip cls={r.to} />,
      exportValue: (r) => r.to,
      sortValue: (r) => r.to,
    },
    {
      id: "amount",
      header: "12M 金額",
      width: 110,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{fmtAmount(r.output_amount_12m)}</span>,
      exportValue: (r) => r.output_amount_12m,
      sortValue: (r) => r.output_amount_12m,
    },
    {
      id: "qty",
      header: "12M 出貨",
      width: 100,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{r.output_qty_12m.toFixed(0)}</span>,
      exportValue: (r) => r.output_qty_12m,
      sortValue: (r) => r.output_qty_12m,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">ABC 分類設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          12.2
        </span>
        <span className="text-[12px] text-[#9A9890]">
          門檻 · 重算週期 · 盤點頻率 · 安全庫存天數 · 模擬預覽
        </span>
      </header>

      {/* Banner */}
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Simulator */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 模擬預覽（Dry-run）</span>
          <span className="text-[11px] text-[#9A9890]">不會直接寫入 DB，需按「儲存設定」才正式套用</span>
        </header>

        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[#9A9890] font-medium">A 類累計占比 ≤ (%)</span>
              <input
                type="number"
                min={1}
                max={99}
                disabled={!canEdit}
                value={aPct}
                onChange={(e) => setAPct(Number(e.target.value))}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[#9A9890] font-medium">B 類累計占比 ≤ (%)</span>
              <input
                type="number"
                min={2}
                max={100}
                disabled={!canEdit}
                value={bPct}
                onChange={(e) => setBPct(Number(e.target.value))}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[#9A9890] font-medium">排序指標</span>
              <select
                disabled={!canEdit}
                value={metric}
                onChange={(e) => setMetric(e.target.value as AbcMetric)}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
              >
                {ABC_METRIC_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} disabled={o.disabled}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={doPreview}
              disabled={!canEdit || isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "計算中⋯" : "預覽效果"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!canEdit || isPending || !simulation || simulation.before.total.count === 0}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              儲存設定
            </button>
          </div>
        </div>

        {/* Donut before/after */}
        {simulation ? (
          simulation.before.total.count === 0 ? (
            <div className="px-4 pb-4 text-[12.5px] text-[#9A9890]">
              目前 brand 沒有 ABC 重算結果，請先到「ABC 分類報表」頁執行重算後再回來預覽。
            </div>
          ) : (
            <div className="px-4 pb-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
                <div className="bg-white border border-[#EEECE6] rounded-lg p-3">
                  <div className="text-[12px] text-[#9A9890] mb-1">現況（before）</div>
                  <DonutChart
                    data={beforeDonut}
                    size="sm"
                    showLegend
                    centerLabel={`${simulation.before.total.count}`}
                    centerCaption="品項"
                  />
                </div>
                <div className="text-center text-[20px] text-[#185FA5] font-semibold">→</div>
                <div className="bg-white border border-[#EEECE6] rounded-lg p-3">
                  <div className="text-[12px] text-[#9A9890] mb-1">套用後（after）</div>
                  <DonutChart
                    data={afterDonut}
                    size="sm"
                    showLegend
                    centerLabel={`${simulation.after.total.count}`}
                    centerCaption="品項"
                  />
                </div>
              </div>

              {/* KPI summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <KpiCard
                  layout="mini"
                  tone="red"
                  label="A 類"
                  value={`${simulation.before.A.count} → ${simulation.after.A.count}`}
                />
                <KpiCard
                  layout="mini"
                  tone="amber"
                  label="B 類"
                  value={`${simulation.before.B.count} → ${simulation.after.B.count}`}
                />
                <KpiCard
                  layout="mini"
                  tone="blue"
                  label="C 類"
                  value={`${simulation.before.C.count} → ${simulation.after.C.count}`}
                />
                <KpiCard
                  layout="mini"
                  tone={simulation.changes.length > 0 ? "purple" : "gray"}
                  label="變動品項"
                  value={`${simulation.changes.length} 筆`}
                />
              </div>

              {/* Change list */}
              <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
                <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 變動清單</span>
                  <span className="text-[11px] text-[#9A9890]">
                    共 <b className="text-[#2C2C2A]">{simulation.changes.length}</b> 個品項分類會調整
                  </span>
                </header>
                <div className="p-2">
                  {simulation.changes.length === 0 ? (
                    <div className="px-4 py-6 text-center text-[12.5px] text-[#9A9890]">
                      套用此參數不會造成任何品項分類變動
                    </div>
                  ) : (
                    <DataGrid
                      columns={changeCols}
                      data={simulation.changes}
                      rowKey={(r) => r.item_id}
                      persistKey="parts/analytics/abc-settings/changes"
                      exportFileName="abc-simulation-changes"
                      emptyMessage="沒有變動"
                      disabled={isPending}
                    />
                  )}
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="px-4 pb-4 text-[12.5px] text-[#9A9890]">
            調整上方參數後按「預覽效果」可看到分類變動模擬，確認後再按「儲存設定」正式套用。
          </div>
        )}
      </section>

      {/* Existing settings (保留原本 4 區，欄位即點即存) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 分類門檻 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 分類門檻（自動儲存）</span>
          </header>
          <div className="px-4 py-4 space-y-3 text-[12.5px]">
            <label className="grid grid-cols-2 gap-3 items-center">
              <span>滾動期間（月）</span>
              <input
                type="number"
                min={1}
                max={36}
                disabled={!canEdit}
                defaultValue={num(c.rolling_period_months, 12)}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v !== num(c.rolling_period_months, 12)) persistField({ rolling_period_months: v });
                }}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
              />
            </label>
            <label className="grid grid-cols-2 gap-3 items-center">
              <span>重算觸發</span>
              <select
                disabled={!canEdit}
                value={c.recalc_trigger ?? "monthly_first"}
                onChange={(e) => persistField({ recalc_trigger: e.target.value })}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
              >
                <option value="manual">手動</option>
                <option value="monthly_first">每月 1 號</option>
                <option value="quarterly">每季</option>
              </select>
            </label>
            <div className="text-[11px] text-[#9A9890]">
              💡 A/B 類門檻請用上方「模擬預覽」流程調整，避免直接覆寫造成大量品項瞬時換類
            </div>
          </div>
        </section>

        {/* 盤點頻率 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 盤點頻率（天）</span>
          </header>
          <div className="px-4 py-4 space-y-3 text-[12.5px]">
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
                  defaultValue={num((c as Record<string, unknown>)[f.k] as number | null, f.fb)}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v !== num((c as Record<string, unknown>)[f.k] as number | null, f.fb)) {
                      persistField({ [f.k]: v });
                    }
                  }}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                />
              </label>
            ))}
          </div>
        </section>

        {/* 安全庫存 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 安全庫存天數</span>
          </header>
          <div className="px-4 py-4 space-y-3 text-[12.5px]">
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
                  defaultValue={num((c as Record<string, unknown>)[f.k] as number | null, f.fb)}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v !== num((c as Record<string, unknown>)[f.k] as number | null, f.fb)) {
                      persistField({ [f.k]: v });
                    }
                  }}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                />
              </label>
            ))}
          </div>
        </section>

        {/* 新品預設 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 新品預設</span>
          </header>
          <div className="px-4 py-4 space-y-3 text-[12.5px]">
            <label className="grid grid-cols-2 gap-3 items-center">
              <span>預設分類</span>
              <select
                disabled={!canEdit}
                value={c.new_item_default_class ?? "C"}
                onChange={(e) => persistField({ new_item_default_class: e.target.value })}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
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
                defaultValue={num(c.new_item_grace_months, 3)}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v !== num(c.new_item_grace_months, 3)) persistField({ new_item_grace_months: v });
                }}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
              />
            </label>
            <div className="text-[11px] text-[#9A9890] mt-1">
              {c.last_recalc_at
                ? `最近一次重算：${c.last_recalc_at.slice(0, 16).replace("T", " ")}`
                : "尚未執行重算"}
            </div>
          </div>
        </section>
      </div>

      {/* Confirm Modal */}
      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl border border-[#EEECE6] w-[420px] max-w-[92vw] p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[14px] font-semibold text-[#2C2C2A]">確認儲存 ABC 分類設定</h3>
            <p className="text-[12.5px] text-[#5A5955] leading-relaxed">
              將 A/B/C 門檻調整為{" "}
              <b className="text-[#1A3A5C]">
                {aPct}% / {bPct}%
              </b>
              ，並依「
              {ABC_METRIC_OPTIONS.find((o) => o.value === metric)?.label}
              」重算分類。
              <br />
              預估會影響 <b className="text-[#CC0000]">{simulation?.changes.length ?? 0}</b> 個品項的 ABC 分類。
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={doApply}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending ? "套用中⋯" : "確認套用"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

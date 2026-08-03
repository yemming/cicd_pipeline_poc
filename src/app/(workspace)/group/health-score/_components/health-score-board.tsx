"use client";

/**
 * GRP16 Dealer Health Score — client board
 *
 * 集團總部視角：把每間門店壓成 0-100 綜合健康分，一眼分級揪墊底店。版面由上到下：
 *   1. Page header（H1 + GRP16 chip + caption）
 *   2. 分數圖例列（5 色階 legend）
 *   3. 集團 Hero：<D3Gauge>（綜合分=門店 score 平均，delta=vs 上季均值）+ 5 KPI 小卡
 *   4. 期間切換 chip（2026 Q2 / Q1 / 2025 Q4 — 純前端切 label，POC 同一份資料）
 *   5. 門店健康評分卡 grid（左六維水平 bar、右 <D3RadarChart>）
 *   6. 近 5 季健康走勢 <D3MultiLineTrend>（每店一條線，warnLine=60）
 *   7. 低分維度改善建議（掃 issues[]）
 *   8. 排行榜表（手刻 table，依 score desc）
 *
 * 「全集團總覽」無門店切換、無 server 重撈 → 純展示 component，期間 chip 只切前端 label。
 * 全程 null/空安全：dims 缺值顯示「—」、空資料顯示提示，不 crash。
 *
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-analytics 注入。
 */

import { useMemo, useState } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { D3Gauge, type GaugeThreshold } from "@/components/charts/d3-gauge";
import { D3RadarChart } from "@/components/charts/d3-radar-chart";
import { D3MultiLineTrend, type MultiLineSeries } from "@/components/charts/d3-multi-line-trend";
import { HEALTH_DIM_LABEL, type HealthDim } from "@/domain/group-analytics-labels";
import type {
  StoreHealthScore,
  StoreScoreHistory,
} from "@/domain/group-analytics";

/* ────────────── 分級色票（全頁基準；對齊 round-18 proposal 與任務規格） ────────────── */

type ScoreGrade = { min: number; color: string; label: string };

/** 由高到低排序（pick 時取第一個達標的） */
const SCORE_GRADES: ScoreGrade[] = [
  { min: 90, color: "#3DBE6E", label: "優秀" },
  { min: 75, color: "#5DCAA5", label: "良好" },
  { min: 60, color: "#F5B942", label: "普通" },
  { min: 45, color: "#E8A73A", label: "警示" },
  { min: 0, color: "#C8001A", label: "危險" },
];

/** 分數 → 色（缺值給中性灰） */
function scoreColor(score: number | null): string {
  if (score == null || Number.isNaN(score)) return "#9A9890";
  for (const g of SCORE_GRADES) {
    if (score >= g.min) return g.color;
  }
  return SCORE_GRADES[SCORE_GRADES.length - 1].color;
}

/** 分數 → 分級 label（缺值「—」） */
function scoreLabel(score: number | null): string {
  if (score == null || Number.isNaN(score)) return "—";
  for (const g of SCORE_GRADES) {
    if (score >= g.min) return g.label;
  }
  return SCORE_GRADES[SCORE_GRADES.length - 1].label;
}

/** gauge thresholds：5 色階（at 由小到大；D3Gauge 取 value>=at 的最大段） */
const GAUGE_THRESHOLDS: GaugeThreshold[] = [
  { at: 0, color: "#C8001A" },
  { at: 45, color: "#E8A73A" },
  { at: 60, color: "#F5B942" },
  { at: 75, color: "#5DCAA5" },
  { at: 90, color: "#3DBE6E" },
];

/** 六維固定順序（雷達 / bar / 排行表共用） */
const HEALTH_DIMS: HealthDim[] = [
  "dim_sales",
  "dim_after",
  "dim_parts",
  "dim_people",
  "dim_csat",
  "dim_finance",
];

/** 期間切換 chip（純前端 label；POC 資料同一份） */
const PERIODS = ["2026 Q2", "2026 Q1", "2025 Q4"];

/* ── 格式化 helper（en-US 千分位跨環境固定，非時區依賴；沿用 round-16/17） ── */
const fmtScore = (v: number | null) =>
  v == null || Number.isNaN(v) ? "—" : String(Math.round(v));
const fmtDelta = (v: number | null) => {
  if (v == null || Number.isNaN(v)) return null;
  const r = Math.round(v * 10) / 10;
  if (r > 0) return { text: `▲ ${r}`, color: "#0F6E56" };
  if (r < 0) return { text: `▼ ${Math.abs(r)}`, color: "#CC0000" };
  return { text: "→ 0", color: "#9A9890" };
};

/** 平均（忽略 null），全空回 null */
function avg(vals: Array<number | null>): number | null {
  const nums = vals.filter((v): v is number => v != null && !Number.isNaN(v));
  if (nums.length === 0) return null;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

/* ────────────── 小元件 ────────────── */

/** 分級色階 legend（5 色） */
function ScoreLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-[#5A5955]">
      {SCORE_GRADES.map((g, i) => {
        const next = SCORE_GRADES[i - 1];
        const range = next ? `${g.min}–${next.min - 1}` : `< ${SCORE_GRADES[i - 1]?.min ?? 45}`;
        // 最高段顯示「≥90」、最低段「<45」
        const label =
          i === 0
            ? `≥${g.min}`
            : i === SCORE_GRADES.length - 1
              ? `<${SCORE_GRADES[i - 1].min}`
              : range;
        return (
          <span key={g.label} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: g.color }}
            />
            <span className="font-medium text-[#2C2C2A]">{g.label}</span>
            <span className="text-[#9A9890] tabular-nums">{label}</span>
          </span>
        );
      })}
    </div>
  );
}

/** 綜合分數 pill（色底白字） */
function ScorePill({ score }: { score: number | null }) {
  const color = scoreColor(score);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums text-white"
      style={{ background: color }}
    >
      {fmtScore(score)}
      <span className="text-[10px] font-medium opacity-90">{scoreLabel(score)}</span>
    </span>
  );
}

/** Hero 旁 KPI 小卡 */
function KpiMini({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <div className="relative bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: accent ?? "#D5D3CB" }}
      />
      <div className="pl-3.5 pr-3 py-3">
        <div className="text-[11px] text-[#9A9890]">{label}</div>
        <div className="mt-1 text-[20px] font-semibold tabular-nums leading-none text-[#2C2C2A]">
          {value}
        </div>
        {sub ? <div className="mt-1 text-[11px] text-[#9A9890]">{sub}</div> : null}
      </div>
    </div>
  );
}

/** section 卡 wrapper（灰底 header） */
function SectionCard({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
        {caption ? <p className="text-[11px] text-[#9A9890] mt-0.5">{caption}</p> : null}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/** 六維水平 bar 一列（每維 scoreColor 上色 + 分數；缺值用斜紋底避免跟「真的 0 分」混淆） */
function DimBarRow({ dim, value }: { dim: HealthDim; value: number | null }) {
  const missing = value == null || Number.isNaN(value);
  const pct = missing ? 0 : Math.max(0, Math.min(100, value));
  const color = scoreColor(value);
  return (
    <div
      className="flex items-center gap-2 py-1"
      title={missing ? `${HEALTH_DIM_LABEL[dim]}維度本期無資料，不計入綜合分` : undefined}
    >
      <span className="w-14 shrink-0 text-[11.5px] text-[#5A5955]">{HEALTH_DIM_LABEL[dim]}</span>
      <div
        className="relative h-2.5 flex-1 rounded-full overflow-hidden"
        style={
          missing
            ? {
                background:
                  "repeating-linear-gradient(135deg,#EEECE6,#EEECE6 4px,#F8F7F4 4px,#F8F7F4 8px)",
              }
            : { background: "#EEECE6" }
        }
      >
        {!missing ? (
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${pct}%`, background: color }}
          />
        ) : null}
      </div>
      <span
        className="w-8 shrink-0 text-right text-[11.5px] font-semibold tabular-nums"
        style={{ color }}
      >
        {fmtScore(value)}
      </span>
    </div>
  );
}

/** 門店健康評分卡（左六維 bar、右雷達） */
function StoreScoreCard({ s }: { s: StoreHealthScore }) {
  const dimsForRadar = useMemo(() => {
    const out: Record<string, number> = {};
    for (const k of HEALTH_DIMS) {
      const v = s.dims[k];
      out[HEALTH_DIM_LABEL[k]] = v == null || Number.isNaN(v) ? 0 : v;
    }
    return out;
  }, [s.dims]);

  const color = scoreColor(s.score);
  const delta = fmtDelta(s.delta);
  const missingLabels = s.missingDims.map((k) => HEALTH_DIM_LABEL[k]);

  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      {/* 卡頂：店名 + 綜合分 pill */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-[#2C2C2A]">
            <span className="truncate">{s.store.short_name ?? s.store.name}</span>
            {missingLabels.length > 0 ? (
              <span
                className="shrink-0 inline-flex h-[15px] w-[15px] items-center justify-center rounded-full bg-[#FDF3E3] text-[10px] font-semibold text-[#854F0B] cursor-help"
                title={`此分數基於 ${s.validDims} 個維度計算（${missingLabels.join("、")} 資料不足）`}
              >
                ⓘ
              </span>
            ) : null}
          </div>
          {delta ? (
            <div className="text-[10.5px]" style={{ color: delta.color }}>
              vs 上季 {delta.text}
            </div>
          ) : (
            <div className="text-[10.5px] text-[#9A9890]">vs 上季 —</div>
          )}
        </div>
        <ScorePill score={s.score} />
      </div>

      {s.validDims > 0 && s.validDims < 3 ? (
        <div className="px-4 py-1.5 bg-[#FDF3E3] text-[11px] text-[#854F0B] border-b border-[#F0DFC0]">
          ⚠ 此門店資料不足（僅 {s.validDims} 個維度有值），Health Score 參考性有限
        </div>
      ) : null}

      {/* 內容：左 bar、右雷達 */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          {HEALTH_DIMS.map((k) => (
            <DimBarRow key={k} dim={k} value={s.dims[k]} />
          ))}
        </div>
        <div className="shrink-0">
          <D3RadarChart
            dims={dimsForRadar}
            color={color}
            size={132}
            max={100}
            emptyMessage="無維度"
          />
        </div>
      </div>
    </div>
  );
}

/** 排行表一格六維小字（缺值加 title tooltip 註明無資料，不寫死顯示為 0） */
function DimMiniCell({ dim, value }: { dim: HealthDim; value: number | null }) {
  const missing = value == null || Number.isNaN(value);
  return (
    <td className="px-2 py-2 text-center" title={missing ? `${HEALTH_DIM_LABEL[dim]}維度本期無資料` : undefined}>
      <span
        className="text-[11.5px] font-semibold tabular-nums"
        style={{ color: scoreColor(value) }}
      >
        {fmtScore(value)}
      </span>
    </td>
  );
}

/* ────────────── 主元件 ────────────── */

export function HealthScoreBoard({
  scores,
  history,
}: {
  scores: StoreHealthScore[];
  history: StoreScoreHistory[];
}) {
  useSetPageHeader({
    title: "Dealer Health Score",
    breadcrumb: [
      { label: "集團管理", href: "/group/dashboard" },
      { label: "Dealer Health Score" },
    ],
    hideSearch: true,
  });

  const [period, setPeriod] = useState(PERIODS[0]);

  /* ── Hero：集團綜合分 = 門店 score 平均；delta = vs 上季均值 ── */
  const groupScore = useMemo(() => avg(scores.map((s) => s.score)), [scores]);
  const groupScorePrev = useMemo(() => avg(scores.map((s) => s.scorePrev)), [scores]);
  const groupDelta =
    groupScore != null && groupScorePrev != null ? groupScore - groupScorePrev : undefined;

  /* ── 5 KPI 小卡：優秀店數 / 良好店數 / 警示+危險店數 / 最強維度 / 最弱維度 ── */
  const kpi = useMemo(() => {
    const withScore = scores.filter((s) => s.score != null);
    const excellent = withScore.filter((s) => (s.score as number) >= 90).length;
    const good = withScore.filter((s) => (s.score as number) >= 75 && (s.score as number) < 90).length;
    const risky = withScore.filter((s) => (s.score as number) < 60).length;

    // 跨店各維平均，找最強 / 最弱
    let strongDim: HealthDim | null = null;
    let strongVal = -Infinity;
    let weakDim: HealthDim | null = null;
    let weakVal = Infinity;
    for (const k of HEALTH_DIMS) {
      const a = avg(scores.map((s) => s.dims[k]));
      if (a == null) continue;
      if (a > strongVal) {
        strongVal = a;
        strongDim = k;
      }
      if (a < weakVal) {
        weakVal = a;
        weakDim = k;
      }
    }
    return {
      excellent,
      good,
      risky,
      strongDim,
      strongVal: strongDim ? strongVal : null,
      weakDim,
      weakVal: weakDim ? weakVal : null,
    };
  }, [scores]);

  /* ── 排行榜（依 score desc，null 墊底） ── */
  const ranked = useMemo(
    () =>
      [...scores].sort((a, b) => {
        const av = a.score ?? -1;
        const bv = b.score ?? -1;
        return bv - av;
      }),
    [scores],
  );

  /* ── 近 5 季走勢：每店一條線（quarters 取任一有資料店的 quarters） ── */
  const trend = useMemo(() => {
    const withQ = history.find((h) => h.quarters.length > 0);
    const quarters = withQ?.quarters ?? [];
    // 對齊 quarters 長度：各店 scores 已與自身 quarters 對齊，這裡假設各店 quarters 一致（同 seed）
    const series: MultiLineSeries[] = history
      .filter((h) => h.scores.some((v) => v != null))
      .map((h) => ({
        name: h.store.short_name ?? h.store.name,
        values: h.scores,
      }));
    return { quarters, series };
  }, [history]);

  /* ── 改善建議：掃所有店 issues[] ── */
  const improvements = useMemo(
    () => scores.map((s) => ({ store: s.store, issues: s.issues })),
    [scores],
  );

  const hasData = scores.length > 0;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">Dealer Health Score</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          GRP16
        </span>
        <span className="text-[12px] text-[#9A9890]">
          每店壓成 0-100 健康分，一眼分級揪墊底店
        </span>
      </header>

      {/* 分數圖例列 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-2.5">
        <ScoreLegend />
      </section>

      {!hasData ? (
        <section className="bg-white border border-[#EEECE6] rounded-lg px-6 py-10 text-center">
          <p className="text-[13px] text-[#5A5955]">尚無門店健康分資料</p>
          <p className="mt-1 text-[12px] text-[#9A9890]">
            此品牌尚未建立門店，或門店尚無對應的健康分快照（待 demo seed）。
          </p>
        </section>
      ) : (
        <>
          {/* 集團 Hero：gauge + 5 KPI 小卡 */}
          <section className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-3">
            <div className="bg-white border border-[#EEECE6] rounded-lg flex flex-col items-center justify-center py-4">
              <D3Gauge
                value={groupScore}
                min={0}
                max={100}
                delta={groupDelta}
                thresholds={GAUGE_THRESHOLDS}
                label="集團綜合健康分"
                size={180}
              />
              <div className="mt-1 text-[11px]" style={{ color: scoreColor(groupScore) }}>
                {scoreLabel(groupScore)} · 共 {scores.length} 店
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <KpiMini
                label="優秀店數"
                value={`${kpi.excellent}`}
                accent="#3DBE6E"
                sub="綜合分 ≥ 90"
              />
              <KpiMini
                label="良好店數"
                value={`${kpi.good}`}
                accent="#5DCAA5"
                sub="綜合分 75–89"
              />
              <KpiMini
                label="警示 / 危險店數"
                value={`${kpi.risky}`}
                accent="#C8001A"
                sub="綜合分 < 60"
              />
              <KpiMini
                label="最強維度"
                value={kpi.strongDim ? HEALTH_DIM_LABEL[kpi.strongDim] : "—"}
                accent="#0F6E56"
                sub={kpi.strongVal != null ? `跨店均 ${fmtScore(kpi.strongVal)} 分` : "資料不足"}
              />
              <KpiMini
                label="最弱維度"
                value={kpi.weakDim ? HEALTH_DIM_LABEL[kpi.weakDim] : "—"}
                accent="#E8A73A"
                sub={kpi.weakVal != null ? `跨店均 ${fmtScore(kpi.weakVal)} 分` : "資料不足"}
              />
            </div>
          </section>

          {/* 期間切換 chip（純前端 label） */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-[#9A9890] font-medium mr-1">期間</span>
            {PERIODS.map((p) => {
              const active = p === period;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`h-[28px] px-3 rounded-full text-[12px] font-medium border transition-colors ${
                    active
                      ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                      : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <span className="text-[11px] text-[#9A9890]">（POC：各期共用同一份快照）</span>
          </div>

          {/* 門店健康評分卡 grid */}
          <SectionCard
            title="門店健康評分卡"
            caption="左為六維分數水平條（依分級上色）、右為六維雷達；卡頂顯示綜合分與分級"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {ranked.map((s) => (
                <StoreScoreCard key={s.store.id} s={s} />
              ))}
            </div>
          </SectionCard>

          {/* 近 5 季健康走勢 */}
          <SectionCard
            title="近 5 季健康走勢"
            caption="每店一條健康分曲線，紅虛線為 60 分警戒；線往下走的門店在惡化"
          >
            {trend.quarters.length > 0 && trend.series.length > 0 ? (
              <D3MultiLineTrend
                x={trend.quarters}
                series={trend.series}
                warnLine={60}
                valueFormat={(v) => String(Math.round(v))}
                height={280}
                emptyMessage="尚無跨季走勢資料（待 demo seed）"
              />
            ) : (
              <p className="py-6 text-center text-[12px] text-[#9A9890]">
                尚無跨季走勢資料（待 demo seed）
              </p>
            )}
          </SectionCard>

          {/* 低分維度改善建議 */}
          <SectionCard
            title="低分維度改善建議"
            caption="掃描各店六維，列出偏低（<60 紅）/ 待加強（60–75 黃）維度與處方"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {improvements.map(({ store, issues }) => (
                <div
                  key={store.id}
                  className="rounded-lg border border-[#EEECE6] bg-white px-3.5 py-3"
                >
                  <div className="mb-1.5 text-[12.5px] font-semibold text-[#2C2C2A]">
                    {store.short_name ?? store.name}
                  </div>
                  {issues.length > 0 ? (
                    <ul className="space-y-1.5">
                      {issues.map((iss, i) => {
                        const isBad = iss.level === "bad";
                        return (
                          <li
                            key={i}
                            className="flex gap-2 text-[12px] leading-relaxed"
                            style={{ color: isBad ? "#CC0000" : "#854F0B" }}
                          >
                            <span className="mt-0.5 shrink-0">{isBad ? "⚠" : "△"}</span>
                            <span>{iss.text}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-[12px] text-[#3B6D11]">✓ 六維健康，無偏低維度。</p>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>

          {/* 排行榜表 */}
          <SectionCard title="門店健康分排行榜" caption="依綜合分數由高到低；六維各欄依分級上色">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-[#EEECE6] text-[11px] text-[#9A9890]">
                    <th className="px-2 py-2 text-center font-medium w-12">排名</th>
                    <th className="px-2 py-2 text-left font-medium">門店</th>
                    <th className="px-2 py-2 text-left font-medium w-44">綜合分</th>
                    {HEALTH_DIMS.map((k) => (
                      <th key={k} className="px-2 py-2 text-center font-medium">
                        {HEALTH_DIM_LABEL[k]}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-center font-medium w-20">vs 上季</th>
                    <th className="px-2 py-2 text-center font-medium w-16">評級</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((s, idx) => {
                    const color = scoreColor(s.score);
                    const pct =
                      s.score == null || Number.isNaN(s.score)
                        ? 0
                        : Math.max(0, Math.min(100, s.score));
                    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
                    const delta = fmtDelta(s.delta);
                    return (
                      <tr key={s.store.id} className="border-b border-[#F2F2F2]">
                        <td className="px-2 py-2 text-center">
                          {medal ? (
                            <span className="text-[15px]">{medal}</span>
                          ) : (
                            <span className="text-[11.5px] text-[#9A9890] tabular-nums">{idx + 1}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-[12.5px] font-medium text-[#2C2C2A]">
                          {s.store.short_name ?? s.store.name}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-7 shrink-0 text-right text-[12.5px] font-semibold tabular-nums"
                              style={{ color }}
                            >
                              {fmtScore(s.score)}
                            </span>
                            <div className="relative h-2 flex-1 rounded-full bg-[#EEECE6] overflow-hidden">
                              <div
                                className="absolute inset-y-0 left-0 rounded-full"
                                style={{ width: `${pct}%`, background: color }}
                              />
                            </div>
                          </div>
                        </td>
                        {HEALTH_DIMS.map((k) => (
                          <DimMiniCell key={k} dim={k} value={s.dims[k]} />
                        ))}
                        <td className="px-2 py-2 text-center">
                          {delta ? (
                            <span
                              className="text-[11.5px] font-semibold tabular-nums"
                              style={{ color: delta.color }}
                            >
                              {delta.text}
                            </span>
                          ) : (
                            <span className="text-[11.5px] text-[#D5D3CB]">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span
                            className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium text-white"
                            style={{ background: color }}
                          >
                            {scoreLabel(s.score)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}

      <p className="text-[11px] text-[#9A9890] leading-relaxed">
        六維分數（銷售/售後/零件/人才/客戶滿意/財務）本期讀 KPI 快照（demo seed，尚未串接即時彙總）；
        綜合分永遠由六維現算 — 缺失維度不計入計算，其他維度等權重新平均（非固定除以 6），卡片上的
        ⓘ 圖示標示實際採計的維度數。issues 與策略建議由 domain helper 規則生成。本頁為全集團總覽
        （無門店切換），期間 chip 於 POC 階段共用同一份快照。分級門檻：優秀 ≥90 · 良好 ≥75 ·
        普通 ≥60 · 警示 ≥45 · 危險 &lt;45。數據來源：kpi_snapshots｜更新頻率：demo seed（非即時）。
      </p>
    </main>
  );
}

"use client";

/**
 * GRP17 門店評估四象限 — client board（暗色戰情室主題）
 *
 * 集團總部的 BCG 矩陣式戰略定位儀表。把所有門店擺進「X 軸 × Y 軸」二維平面、依動態均值
 * 十字切四象限（卓越 / 穩健 / 待發展 / 重點輔導），一眼看出標竿與墊底店、做資源分配決策。
 *
 * 版面（暗底 #0D1B2A）由上到下：
 *   1. Page header（H1 + GRP17 chip + caption）
 *   2. 軸切換控制列（X 軸 / Y 軸 / 圓圈大小 三個 select + 歷史軌跡 trail toggle）
 *   3. 主四象限散佈圖（<D3ScatterChart theme="dark">，含四角象限標籤 + 點擊鑽取）並排右側詳情面板
 *   4. 門店象限分類一覽（依當前均值十字分 4 組，4 欄清單，點擊驅動詳情）
 *
 * 「全集團總覽」無門店切換、無 server 重撈 → 軸切換 / size / trail 全是純前端 useState
 * 觸發的 D3 redraw，不打 server。全程 null/空安全：缺值「—」、空資料顯示提示，不 crash。
 *
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-analytics 注入。
 */

import { useMemo, useState } from "react";
import { mean } from "d3-array";

import { useSetPageHeader } from "@/components/page-header-context";
import { D3ScatterChart } from "@/components/charts/d3-scatter";
import { D3RadarChart } from "@/components/charts/d3-radar-chart";
import { HEALTH_DIM_LABEL, type HealthDim } from "@/domain/group-analytics-labels";
import type {
  StoreHealthScore,
  StoreScoreHistory,
} from "@/domain/group-analytics";

/* ────────────── 暗色 token（全頁基準） ────────────── */
const DARK = {
  bg: "#0D1B2A",
  card: "#13263B",
  cardSoft: "#0F2236",
  border: "#22364D",
  text: "#E6EDF5",
  textSub: "#8FA3B8",
  textMuted: "#5E7388",
  inputBorder: "#2C4258",
};

/* ────────────── 象限定義 ────────────── */
type Quad = "tr" | "br" | "tl" | "bl";
const QUAD_META: Record<Quad, { label: string; color: string }> = {
  tr: { label: "卓越門店", color: "#3DBE6E" },
  br: { label: "穩健門店", color: "#5DCAA5" },
  tl: { label: "待發展門店", color: "#85B7EB" },
  bl: { label: "重點輔導門店", color: "#F5B942" },
};
const QUAD_ORDER: Quad[] = ["tr", "br", "tl", "bl"];

/* ────────────── 軸選項定義 ────────────── */
type AxisKey = "achievement_rate" | "gross_profit_rate" | "score" | "store_nps" | "growth_rate";
type SizeKey = "revenue_scale" | "staff_count" | "score";

const AXIS_OPTIONS: Array<{ key: AxisKey; label: string; pct: boolean }> = [
  { key: "achievement_rate", label: "達成率", pct: true },
  { key: "gross_profit_rate", label: "毛利率", pct: true },
  { key: "score", label: "健康分", pct: false },
  { key: "store_nps", label: "客戶 NPS", pct: false },
  { key: "growth_rate", label: "成長率", pct: true },
];

const SIZE_OPTIONS: Array<{ key: SizeKey; label: string }> = [
  { key: "revenue_scale", label: "營收規模" },
  { key: "staff_count", label: "員工數" },
  { key: "score", label: "健康分" },
];

const axisMeta = (k: AxisKey) => AXIS_OPTIONS.find((o) => o.key === k)!;

/* ── 格式化（en-US 千分位跨環境固定，非時區依賴；沿用 round-16/17） ── */
const fmtPct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const fmtInt = (v: number) => String(Math.round(v));

/** 依軸是否為 0..1 比率決定數值格式 */
const fmtAxis = (k: AxisKey) => (axisMeta(k).pct ? fmtPct : fmtInt);

/** 取某店在指定軸的當前數值（缺值回 null） */
function axisValue(s: StoreHealthScore, k: AxisKey): number | null {
  const v = s[k];
  return v == null || Number.isNaN(v) ? null : v;
}
function sizeValue(s: StoreHealthScore, k: SizeKey): number | null {
  const v = s[k];
  return v == null || Number.isNaN(v) ? null : v;
}

export function StoreQuadrantBoard({
  scores,
  history,
}: {
  scores: StoreHealthScore[];
  history: StoreScoreHistory[];
}) {
  useSetPageHeader({
    title: "門店評估四象限",
    breadcrumb: [
      { label: "集團管理", href: "/group/dashboard" },
      { label: "門店評估四象限" },
    ],
    hideSearch: true,
  });

  /* 軸 / 大小 / 軌跡：純前端 state（改動只觸發 D3 redraw，不打 server） */
  const [xKey, setXKey] = useState<AxisKey>("achievement_rate");
  const [yKey, setYKey] = useState<AxisKey>("score");
  const [sizeKey, setSizeKey] = useState<SizeKey>("revenue_scale");
  const [trailOn, setTrailOn] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* history 依 store.id 索引（trail / 詳情面板用） */
  const historyById = useMemo(() => {
    const m = new Map<string, StoreScoreHistory>();
    for (const h of history) m.set(h.store.id, h);
    return m;
  }, [history]);

  /* 動態均值十字：對「兩軸都有有效值」的店算 mean（與散佈圖元件內建十字一致） */
  const { xMean, yMean } = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const s of scores) {
      const vx = axisValue(s, xKey);
      const vy = axisValue(s, yKey);
      if (vx != null && vy != null) {
        xs.push(vx);
        ys.push(vy);
      }
    }
    return {
      xMean: xs.length ? (mean(xs) ?? null) : null,
      yMean: ys.length ? (mean(ys) ?? null) : null,
    };
  }, [scores, xKey, yKey]);

  /** 某店在當前均值十字下的象限（任一軸缺值 / 無均值 → null=未分類） */
  const quadOf = useMemo(() => {
    return (s: StoreHealthScore): Quad | null => {
      if (xMean == null || yMean == null) return null;
      const vx = axisValue(s, xKey);
      const vy = axisValue(s, yKey);
      if (vx == null || vy == null) return null;
      const right = vx >= xMean;
      const top = vy >= yMean;
      if (right && top) return "tr";
      if (right && !top) return "br";
      if (!right && top) return "tl";
      return "bl";
    };
  }, [xMean, yMean, xKey, yKey]);

  /* 四欄分組（一覽用）：每象限一個門店陣列，按健康分 desc */
  const grouped = useMemo(() => {
    const g: Record<Quad, StoreHealthScore[]> = { tr: [], br: [], tl: [], bl: [] };
    for (const s of scores) {
      const q = quadOf(s);
      if (q) g[q].push(s);
    }
    for (const q of QUAD_ORDER) {
      g[q].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    }
    return g;
  }, [scores, quadOf]);

  const unclassified = useMemo(
    () => scores.filter((s) => quadOf(s) == null).length,
    [scores, quadOf],
  );

  /* trail pointsOf：回該店近 5 季在「當前 X/Y 軸平面」的點序列 */
  const trailPointsOf = useMemo(() => {
    /** 某軸的歷史序列：score→axes.health、achievement_rate→axes.achievement、其餘軸無歷史→當前值常數 */
    const seriesFor = (
      s: StoreHealthScore,
      hist: StoreScoreHistory | undefined,
      key: AxisKey,
      n: number,
    ): Array<number | null> => {
      if (hist) {
        if (key === "score") return hist.axes.health;
        if (key === "achievement_rate") return hist.axes.achievement;
      }
      // 無歷史的軸 → 當前值常數填滿（長度=季數）
      const cur = axisValue(s, key);
      return Array.from({ length: n }, () => cur);
    };
    return (s: StoreHealthScore): Array<{ x: number; y: number }> => {
      const hist = historyById.get(s.store.id);
      const n = hist?.quarters.length ?? 0;
      if (n < 2) return [];
      const xsSeries = seriesFor(s, hist, xKey, n);
      const ysSeries = seriesFor(s, hist, yKey, n);
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < n; i++) {
        const xv = xsSeries[i];
        const yv = ysSeries[i];
        if (xv == null || yv == null || Number.isNaN(xv) || Number.isNaN(yv)) continue;
        pts.push({ x: xv, y: yv });
      }
      return pts;
    };
  }, [historyById, xKey, yKey]);

  const selected = useMemo(
    () => (selectedId ? (scores.find((s) => s.store.id === selectedId) ?? null) : null),
    [selectedId, scores],
  );

  const hasData = scores.length > 0;

  /* select 共用 className（暗底可讀） */
  const selectClass =
    "h-[30px] rounded px-2 text-[12.5px] focus:outline-none focus:border-[#5DA8E8]";
  const selectStyle = {
    background: DARK.cardSoft,
    border: `1px solid ${DARK.inputBorder}`,
    color: DARK.text,
  };

  return (
    <main className="px-6 py-5 space-y-3 min-h-screen" style={{ background: DARK.bg }}>
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold" style={{ color: DARK.text }}>
          門店評估四象限
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#1B3A5C] text-[#85B7EB] font-medium">
          GRP17
        </span>
        <span className="text-[12px]" style={{ color: DARK.textSub }}>
          BCG 矩陣式戰略定位，一眼分卓越 / 穩健 / 待發展 / 重點輔導
        </span>
      </header>

      {!hasData ? (
        <section
          className="rounded-lg px-6 py-12 text-center"
          style={{ background: DARK.card, border: `1px solid ${DARK.border}` }}
        >
          <p className="text-[13px]" style={{ color: DARK.textSub }}>
            尚無門店健康分數資料
          </p>
          <p className="mt-1 text-[12px]" style={{ color: DARK.textMuted }}>
            此品牌尚未建立 level=2 門店、或門店無對應策略評估快照（待 demo seed）。
          </p>
        </section>
      ) : (
        <>
          {/* 軸切換控制列 */}
          <section
            className="rounded-lg px-4 py-3"
            style={{ background: DARK.card, border: `1px solid ${DARK.border}` }}
          >
            <div className="flex items-end gap-4 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium" style={{ color: DARK.textSub }}>
                  X 軸（橫）
                </label>
                <select
                  className={selectClass}
                  style={selectStyle}
                  value={xKey}
                  onChange={(e) => setXKey(e.target.value as AxisKey)}
                >
                  {AXIS_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key} style={{ background: DARK.cardSoft }}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium" style={{ color: DARK.textSub }}>
                  Y 軸（縱）
                </label>
                <select
                  className={selectClass}
                  style={selectStyle}
                  value={yKey}
                  onChange={(e) => setYKey(e.target.value as AxisKey)}
                >
                  {AXIS_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key} style={{ background: DARK.cardSoft }}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium" style={{ color: DARK.textSub }}>
                  圓圈大小
                </label>
                <select
                  className={selectClass}
                  style={selectStyle}
                  value={sizeKey}
                  onChange={(e) => setSizeKey(e.target.value as SizeKey)}
                >
                  {SIZE_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key} style={{ background: DARK.cardSoft }}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium" style={{ color: DARK.textSub }}>
                  歷史軌跡
                </label>
                <button
                  type="button"
                  onClick={() => setTrailOn((v) => !v)}
                  className="h-[30px] px-3.5 rounded-full text-[12.5px] font-medium border transition-colors"
                  style={
                    trailOn
                      ? { background: "#1B3A5C", color: "#85B7EB", borderColor: "#3A6E9E" }
                      : { background: DARK.cardSoft, color: DARK.textSub, borderColor: DARK.inputBorder }
                  }
                >
                  {trailOn ? "● 軌跡開（近 5 季）" : "○ 軌跡關"}
                </button>
              </div>

              {/* 象限圖例 */}
              <div className="ml-auto flex items-center gap-3 flex-wrap">
                {QUAD_ORDER.map((q) => (
                  <span key={q} className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: DARK.textSub }}>
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ background: QUAD_META[q].color }}
                    />
                    {QUAD_META[q].label}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* 主四象限散佈圖 + 右側詳情面板 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* 散佈圖（佔 2/3） */}
            <section
              className="lg:col-span-2 rounded-lg p-4"
              style={{ background: DARK.card, border: `1px solid ${DARK.border}` }}
            >
              <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-[13px] font-semibold" style={{ color: DARK.text }}>
                  戰略定位散佈圖
                </h2>
                <span className="text-[11px]" style={{ color: DARK.textMuted }}>
                  X：{axisMeta(xKey).label} · Y：{axisMeta(yKey).label} · 大小：
                  {SIZE_OPTIONS.find((o) => o.key === sizeKey)!.label}
                  {unclassified > 0 ? ` · ${unclassified} 店資料不足未繪` : ""}
                </span>
              </div>
              <D3ScatterChart<StoreHealthScore>
                data={scores}
                x={(d) => axisValue(d, xKey)}
                y={(d) => axisValue(d, yKey)}
                sizeOf={(d) => sizeValue(d, sizeKey)}
                xLabel={axisMeta(xKey).label}
                yLabel={axisMeta(yKey).label}
                xFormat={fmtAxis(xKey)}
                yFormat={fmtAxis(yKey)}
                theme="dark"
                tagOf={(d) => d.tag}
                keyOf={(d) => d.store.id}
                selectedKey={selectedId}
                onSelect={(d) => setSelectedId(d.store.id)}
                showLabel={(d) => d.store.short_name ?? d.store.name}
                trail={{ show: trailOn, pointsOf: trailPointsOf }}
                quadrantLabels={{
                  tr: "卓越門店",
                  br: "穩健門店",
                  tl: "待發展門店",
                  bl: "重點輔導門店",
                }}
                height={420}
                emptyMessage="所選軸無有效門店資料"
              />
              <p className="mt-1 text-[11px]" style={{ color: DARK.textMuted }}>
                以全集團「{axisMeta(xKey).label} / {axisMeta(yKey).label}」均值十字切四象限；點圓圈鑽取門店詳情。
              </p>
            </section>

            {/* 右側詳情面板（佔 1/3） */}
            <section
              className="rounded-lg p-4"
              style={{ background: DARK.card, border: `1px solid ${DARK.border}` }}
            >
              {selected == null ? (
                <div
                  className="flex h-full min-h-[300px] flex-col items-center justify-center text-center"
                  style={{ color: DARK.textMuted }}
                >
                  <span className="text-[28px] leading-none">⊕</span>
                  <p className="mt-2 text-[12.5px]">點擊門店查看詳情</p>
                  <p className="mt-1 text-[11px]">散佈圖圓圈或下方象限一覽皆可點選</p>
                </div>
              ) : (
                <StoreDetail
                  store={selected}
                  quad={quadOf(selected)}
                  history={historyById.get(selected.store.id) ?? null}
                />
              )}
            </section>
          </div>

          {/* 門店象限分類一覽 */}
          <section
            className="rounded-lg p-4"
            style={{ background: DARK.card, border: `1px solid ${DARK.border}` }}
          >
            <div className="mb-2.5 flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-[13px] font-semibold" style={{ color: DARK.text }}>
                門店象限分類一覽
              </h2>
              <span className="text-[11px]" style={{ color: DARK.textMuted }}>
                依當前均值十字動態分組 · 點擊查看詳情
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {QUAD_ORDER.map((q) => {
                const meta = QUAD_META[q];
                const list = grouped[q];
                return (
                  <div
                    key={q}
                    className="rounded-lg overflow-hidden"
                    style={{ background: DARK.cardSoft, border: `1px solid ${DARK.border}` }}
                  >
                    <header
                      className="px-3 py-2 flex items-center justify-between"
                      style={{ borderBottom: `1px solid ${DARK.border}` }}
                    >
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: DARK.text }}>
                        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: meta.color }} />
                        {meta.label}
                      </span>
                      <span className="text-[11px] tabular-nums" style={{ color: DARK.textMuted }}>
                        {list.length}
                      </span>
                    </header>
                    <ul className="px-2 py-2 space-y-0.5 min-h-[44px]">
                      {list.length === 0 ? (
                        <li className="px-1.5 py-1 text-[11.5px]" style={{ color: DARK.textMuted }}>
                          無門店
                        </li>
                      ) : (
                        list.map((s) => {
                          const active = s.store.id === selectedId;
                          return (
                            <li key={s.store.id}>
                              <button
                                type="button"
                                onClick={() => setSelectedId(s.store.id)}
                                className="w-full flex items-center gap-2 rounded px-1.5 py-1 text-left transition-colors"
                                style={{ background: active ? "#1B3A5C" : "transparent" }}
                              >
                                <span
                                  className="inline-block w-2 h-2 rounded-full shrink-0"
                                  style={{ background: meta.color }}
                                />
                                <span
                                  className="flex-1 truncate text-[12px]"
                                  style={{ color: active ? "#FFFFFF" : DARK.text }}
                                >
                                  {s.store.short_name ?? s.store.name}
                                </span>
                                <span
                                  className="text-[11.5px] tabular-nums shrink-0"
                                  style={{ color: DARK.textSub }}
                                >
                                  {s.score == null ? "—" : fmtInt(s.score)}
                                </span>
                              </button>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          <p className="text-[11px] leading-relaxed" style={{ color: DARK.textMuted }}>
            資料沿用 round-16/17 策略：門店層指標讀 KPI 快照（demo seed）。象限分類隨選定軸動態
            重算，軸切換 / 圓圈大小 / 歷史軌跡皆為前端即時重繪，不打 server。
          </p>
        </>
      )}
    </main>
  );
}

/* ────────────── 詳情面板 ────────────── */

function StoreDetail({
  store,
  quad,
  history,
}: {
  store: StoreHealthScore;
  quad: Quad | null;
  history: StoreScoreHistory | null;
}) {
  const meta = quad ? QUAD_META[quad] : null;

  const kpis: Array<{ label: string; value: number | null; pct: boolean }> = [
    { label: "達成率", value: store.achievement_rate, pct: true },
    { label: "毛利率", value: store.gross_profit_rate, pct: true },
    { label: "客戶 NPS", value: store.store_nps, pct: false },
    { label: "成長率", value: store.growth_rate, pct: true },
  ];

  /* 六維（雷達 + 水平 bar 共用）；過濾缺值維度供雷達 */
  const dimEntries = (Object.keys(HEALTH_DIM_LABEL) as HealthDim[]).map((k) => ({
    key: k,
    label: HEALTH_DIM_LABEL[k],
    value: store.dims[k],
  }));
  const radarDims: Record<string, number> = {};
  for (const e of dimEntries) {
    if (e.value != null && !Number.isNaN(e.value)) radarDims[e.label] = e.value;
  }
  const hasRadar = Object.keys(radarDims).length >= 3;

  const histScores = history?.scores ?? [];
  const histQuarters = history?.quarters ?? [];

  return (
    <div className="space-y-3">
      {/* 店名 + 象限 badge */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15px] font-semibold leading-tight" style={{ color: DARK.text }}>
            {store.store.name}
          </h3>
          {meta ? (
            <span
              className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium"
              style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}66` }}
            >
              {meta.label}
            </span>
          ) : (
            <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px]" style={{ background: "#1E2D40", color: DARK.textMuted }}>
              未分類
            </span>
          )}
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[24px] font-semibold tabular-nums leading-none" style={{ color: DARK.text }}>
            {store.score == null ? "—" : fmtInt(store.score)}
          </span>
          <span className="text-[11px]" style={{ color: DARK.textSub }}>
            綜合健康分
          </span>
          {store.delta != null ? (
            <span
              className="text-[11px] tabular-nums"
              style={{ color: store.delta > 0 ? "#3DBE6E" : store.delta < 0 ? "#F0635E" : DARK.textMuted }}
            >
              {store.delta > 0 ? "▲" : store.delta < 0 ? "▼" : "－"}
              {Math.abs(Math.round(store.delta * 10) / 10)}
            </span>
          ) : null}
        </div>
      </div>

      {/* 4 KPI 格 */}
      <div className="grid grid-cols-2 gap-2">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-lg px-2.5 py-2"
            style={{ background: DARK.cardSoft, border: `1px solid ${DARK.border}` }}
          >
            <div className="text-[10.5px]" style={{ color: DARK.textSub }}>
              {k.label}
            </div>
            <div className="mt-0.5 text-[16px] font-semibold tabular-nums leading-none" style={{ color: DARK.text }}>
              {k.value == null ? "—" : k.pct ? fmtPct(k.value) : fmtInt(k.value)}
            </div>
          </div>
        ))}
      </div>

      {/* 六維雷達（>=3 維才畫） */}
      {hasRadar ? (
        <div
          className="rounded-lg px-2 py-2 flex justify-center"
          style={{ background: DARK.cardSoft, border: `1px solid ${DARK.border}` }}
        >
          <D3RadarChart dims={radarDims} max={100} color="#5DA8E8" size={172} />
        </div>
      ) : null}

      {/* 六維水平 bar */}
      <div>
        <div className="text-[11px] mb-1.5" style={{ color: DARK.textSub }}>
          六維分數
        </div>
        <div className="space-y-1">
          {dimEntries.map((e) => {
            const pct = e.value == null ? 0 : Math.max(0, Math.min(100, e.value));
            return (
              <div key={e.key} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-[11px]" style={{ color: DARK.textSub }}>
                  {e.label}
                </span>
                <div className="relative h-2.5 flex-1 rounded-full overflow-hidden" style={{ background: "#1E2D40" }}>
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${pct}%`, background: dimBarColor(e.value) }}
                  />
                </div>
                <span className="w-9 shrink-0 text-right text-[11px] tabular-nums" style={{ color: DARK.text }}>
                  {e.value == null ? "—" : fmtInt(e.value)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 建議策略 */}
      <div
        className="rounded-lg px-3 py-2.5"
        style={{ background: DARK.cardSoft, border: `1px solid ${DARK.border}` }}
      >
        <div className="text-[11px] mb-1" style={{ color: DARK.textSub }}>
          建議策略
        </div>
        <p className="text-[12px] leading-relaxed" style={{ color: DARK.text }}>
          {store.strategy}
        </p>
      </div>

      {/* Health 近 5 季歷史 bar */}
      <div>
        <div className="text-[11px] mb-1.5" style={{ color: DARK.textSub }}>
          健康分近 {histScores.length || "—"} 季走勢
        </div>
        {histScores.length === 0 ? (
          <p className="text-[11.5px]" style={{ color: DARK.textMuted }}>
            尚無季度歷史
          </p>
        ) : (
          <div className="flex items-end gap-2 h-24 px-1">
            {histScores.map((sc, i) => {
              const h = sc == null ? 0 : Math.max(2, Math.min(100, sc));
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums" style={{ color: DARK.textSub }}>
                    {sc == null ? "—" : fmtInt(sc)}
                  </span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${h}%`,
                        background: dimBarColor(sc),
                        opacity: i === histScores.length - 1 ? 1 : 0.6,
                      }}
                    />
                  </div>
                  <span className="text-[9.5px] tabular-nums" style={{ color: DARK.textMuted }}>
                    {histQuarters[i] ?? ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** 分數 → bar 色（暗底分級：高綠 / 中藍 / 低琥珀 / 危紅 / 缺灰） */
function dimBarColor(v: number | null): string {
  if (v == null || Number.isNaN(v)) return "#3A4A5C";
  if (v >= 80) return "#3DBE6E";
  if (v >= 65) return "#5DA8E8";
  if (v >= 50) return "#F5B942";
  return "#F0635E";
}

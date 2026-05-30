"use client";

/**
 * D3GroupedBar — 可重用群組長條圖（hybrid：D3 算 scale，React 渲染 SVG）
 *
 * 一個元件吃兩種變體，用 `orientation` 切：
 *   - "vertical"   垂直群組長條（多店多系列）：照設計稿 drawStoreFlow，
 *                  每組類別（門店）並排數根系列（new / repeat / churn），由底長出。
 *   - "horizontal" 水平單系列長條（橫條排行）：照設計稿 drawChurn，
 *                  每條一個 group（流失原因），末端帶百分比標籤、可各條不同色。
 *
 * 設計取捨（沿用 d3-line-trend / d3-multi-line-trend / d3-scatter 的 hybrid 風格）：
 *   - 用 d3-scale 的 scaleBand / scaleLinear 算座標映射；SVG（<rect>/<line>/<text>）
 *     用 JSX 渲染，不跟 React 搶 DOM、天然支援 StrictMode 雙跑。
 *   - 長出 / 伸長動畫用 CSS @keyframes（duration 700、stagger delay i*80）而非 d3.transition()，
 *     才不會跟 React 的 DOM ownership 打架；@keyframes 掛載即播、且把資料簽章 dataKey
 *     當 <g> 的 React key → 資料變動時 bars remount 重播動畫。純 CSS、無 state-in-effect。
 *   - RWD：ResizeObserver 量容器寬，svg 用 viewBox 自適應。
 *   - 空安全：無 group / 無有效系列時顯示佔位框。
 *   - 數字格式化用確定性方式（不用會 locale 漂移的 toLocaleString）。
 *
 * 紀律：純前端 presentational component，不 import supabase、不過網路。
 */

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { scaleBand, scaleLinear } from "d3-scale";

export interface BarSeries {
  /** 系列 key（唯一，動畫 / React key 用） */
  key: string;
  /** 圖例 / 顯示名 */
  label: string;
  /** 系列色（不給時用 DEFAULT_COLORS 輪替） */
  color?: string;
  /** 與 groups 同長度的值序列 */
  values: number[];
}

export interface D3GroupedBarProps {
  /** 垂直模式=每組類別（門店名）；水平模式=每條的 label（流失原因） */
  groups: string[];
  /**
   * 垂直模式=多系列（new / repeat / churn 各一個 BarSeries）；
   * 水平模式=單一系列（取 series[0]，values 對齊 groups）。
   */
  series: BarSeries[];
  /** 變體，預設 "vertical" */
  orientation?: "vertical" | "horizontal";
  /** 高度（px）；寬度自適應容器 */
  height?: number;
  /** 水平模式末端標籤後綴，例 "%" */
  valueSuffix?: string;
  /**
   * 水平模式每條顏色（對齊 groups）。給了就逐條上色、優先於 series[0].color；
   * 不給則整條用 series[0].color（或色盤第 0 色）。垂直模式忽略此欄。
   */
  colors?: string[];
  /** 數值格式化（軸刻度 / 末端標籤共用），預設四捨五入整數 */
  valueFormat?: (v: number) => string;
  /** 垂直模式是否顯示下方圖例，預設 true */
  showLegend?: boolean;
  /** 沒資料時的訊息 */
  emptyMessage?: string;
  /** 外層容器額外 className */
  className?: string;
}

const DEFAULT_COLORS = [
  "#3DBE6E",
  "#1A3A5C",
  "#C8001A",
  "#854F0B",
  "#F5B942",
  "#9A9890",
];

const AXIS_TEXT = "#5A5A5A";
const AXIS_LINE = "#D5D3CB";
const GRID_LINE = "#EEECE6";
const BAR_RADIUS = 3;
// 動畫：對齊 house-style 的 duration 700 / delay i*80
const ANIM_MS = 700;
const ANIM_STAGGER_MS = 80;

const MARGIN_V = { top: 16, right: 16, bottom: 34, left: 48 };
// 水平模式左側留給較長的中文 group 標籤
const MARGIN_H = { top: 12, right: 56, bottom: 28, left: 96 };

/** 確定性整數格式化（不走 toLocaleString，避免 SSR/CSR locale 漂移）。 */
function defaultFormat(v: number): string {
  return String(Math.round(v));
}

export function D3GroupedBar({
  groups,
  series,
  orientation = "vertical",
  height = 260,
  valueSuffix = "",
  colors,
  valueFormat = defaultFormat,
  showLegend = true,
  emptyMessage = "尚無資料",
  className,
}: D3GroupedBarProps) {
  const uid = useId().replace(/[:]/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(480);

  // RWD：ResizeObserver 量容器寬，svg 用 viewBox 自適應
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = e.contentRect.width;
        if (w > 0) setWidth(w);
      }
    });
    ro.observe(el);
    const w0 = el.clientWidth;
    if (w0 > 0) setWidth(w0);
    return () => ro.disconnect();
  }, []);

  const isVertical = orientation === "vertical";
  const margin = isVertical ? MARGIN_V : MARGIN_H;
  const innerW = Math.max(40, width - margin.left - margin.right);
  const innerH = Math.max(40, height - margin.top - margin.bottom);

  // 系列補色（caller 沒給就用色盤輪替）
  const colored = useMemo(
    () =>
      series.map((s, i) => ({
        ...s,
        resolvedColor: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      })),
    [series],
  );

  // 資料簽章：當 groups / series / orientation 變動時換掉，當作 <g> 的 React key →
  // bars 被 remount → CSS @keyframes 重新播一次長出動畫（純 CSS，無 state-in-effect）。
  const dataKey = useMemo(
    () =>
      `${orientation}|${groups.join(",")}|${series
        .map((s) => `${s.key}:${s.values.join("_")}`)
        .join(";")}`,
    [orientation, groups, series],
  );

  const { x0, x1, xLin, yBand, yLin, yTicks, hasData } = useMemo(() => {
    if (isVertical) {
      // 垂直：x0=group band、x1=series band（組內並排）、y=linear（0~max*1.2）
      const x0 = scaleBand<string>().domain(groups).range([0, innerW]).padding(0.3);
      const x1 = scaleBand<string>()
        .domain(colored.map((s) => s.key))
        .range([0, x0.bandwidth()])
        .padding(0.08);

      let maxV = 0;
      for (const s of colored) {
        for (const v of s.values) {
          if (typeof v === "number" && !Number.isNaN(v) && v > maxV) maxV = v;
        }
      }
      const yMax = maxV > 0 ? maxV * 1.2 : 1;
      const yLin = scaleLinear().domain([0, yMax]).range([innerH, 0]);

      return {
        x0,
        x1,
        xLin: null,
        yBand: null,
        yLin,
        yTicks: yLin.ticks(4),
        hasData: maxV > 0,
      };
    }

    // 水平：y=group band、x=linear（0~max*1.2）
    const s0 = colored[0];
    const vals = s0?.values ?? [];
    let maxV = 0;
    for (const v of vals) {
      if (typeof v === "number" && !Number.isNaN(v) && v > maxV) maxV = v;
    }
    const xMax = maxV > 0 ? maxV * 1.2 : 1;
    const yBand = scaleBand<string>().domain(groups).range([0, innerH]).padding(0.35);
    const xLin = scaleLinear().domain([0, xMax]).range([0, innerW]);

    return {
      x0: null,
      x1: null,
      xLin,
      yBand,
      yLin: null,
      yTicks: xLin.ticks(4),
      hasData: maxV > 0,
    };
  }, [isVertical, groups, colored, innerW, innerH]);

  if (groups.length === 0 || series.length === 0 || !hasData) {
    return (
      <div
        ref={containerRef}
        className={`flex items-center justify-center text-[12px] text-[#9A9890] bg-[#F8F7F4] border border-dashed border-[#D5D3CB] rounded-lg ${className ?? ""}`}
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative w-full ${className ?? ""}`} style={{ minWidth: 0 }}>
      {/* 長出動畫用 @keyframes（mount 即播、key 換掉重播），純 CSS、無 state-in-effect。
          scaleY/scaleX 從 transform-origin（底 / 左）由 0 長到 1。 */}
      <style>{`
        @keyframes dgb-grow-up-${uid} { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes dgb-grow-right-${uid} { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes dgb-fade-in-${uid} { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", overflow: "visible" }}
        role="img"
        aria-label={isVertical ? "群組長條圖" : "橫條排行圖"}
      >
        <g key={dataKey} transform={`translate(${margin.left},${margin.top})`}>
          {isVertical
            ? renderVertical({
                uid,
                groups,
                colored,
                x0: x0!,
                x1: x1!,
                yLin: yLin!,
                yTicks,
                innerW,
                innerH,
                valueFormat,
              })
            : renderHorizontal({
                uid,
                groups,
                colored,
                xLin: xLin!,
                yBand: yBand!,
                yTicks,
                innerH,
                colors,
                valueSuffix,
                valueFormat,
              })}
        </g>
      </svg>

      {/* 垂直模式可選下方 legend */}
      {isVertical && showLegend ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-[#5A5955]">
          {colored.map((s) => (
            <span key={`lg-${uid}-${s.key}`} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: s.resolvedColor }}
              />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ───────────────────────── 垂直群組長條 ───────────────────────── */

type ColoredSeries = BarSeries & { resolvedColor: string };

function renderVertical({
  uid,
  groups,
  colored,
  x0,
  x1,
  yLin,
  yTicks,
  innerW,
  innerH,
  valueFormat,
}: {
  uid: string;
  groups: string[];
  colored: ColoredSeries[];
  x0: ReturnType<typeof scaleBand<string>>;
  x1: ReturnType<typeof scaleBand<string>>;
  yLin: ReturnType<typeof scaleLinear<number, number>>;
  yTicks: number[];
  innerW: number;
  innerH: number;
  valueFormat: (v: number) => string;
}) {
  const barW = x1.bandwidth();
  return (
    <>
      {/* y 軸格線 + 刻度（去 domain/tick line） */}
      {yTicks.map((tv) => (
        <g key={`y-${uid}-${tv}`}>
          <line x1={0} x2={innerW} y1={yLin(tv)} y2={yLin(tv)} stroke={GRID_LINE} strokeDasharray="2 3" />
          <text x={-8} y={yLin(tv) + 3.5} textAnchor="end" fontSize={10} fill="#9A9890">
            {valueFormat(tv)}
          </text>
        </g>
      ))}

      {/* x 軸標籤（11px 灰；去 domain/line） */}
      {groups.map((g, gi) => (
        <text
          key={`x-${uid}-${gi}`}
          x={(x0(g) ?? 0) + x0.bandwidth() / 2}
          y={innerH + 16}
          textAnchor="middle"
          fontSize={11}
          fill={AXIS_TEXT}
        >
          {g}
        </text>
      ))}

      {/* bars：每系列一組 rect，x=x0(group)+x1(key)，由底 scaleY 0→1 長出。
          transform-origin 設在 rect 底（gx 中線, innerH）；delay 依「組序」錯開（設計稿 i*80）。 */}
      {colored.map((s, si) =>
        groups.map((g, gi) => {
          const v = s.values[gi];
          if (typeof v !== "number" || Number.isNaN(v)) return null;
          const gx = (x0(g) ?? 0) + (x1(s.key) ?? 0);
          const barH = innerH - yLin(v);
          return (
            <rect
              key={`bar-${uid}-${si}-${gi}`}
              x={gx}
              y={innerH - barH}
              width={barW}
              height={barH}
              rx={BAR_RADIUS}
              fill={s.resolvedColor}
              style={{
                transformOrigin: `${gx + barW / 2}px ${innerH}px`,
                transformBox: "view-box",
                animation: `dgb-grow-up-${uid} ${ANIM_MS}ms cubic-bezier(.22,1,.36,1) both`,
                animationDelay: `${gi * ANIM_STAGGER_MS}ms`,
              }}
            />
          );
        }),
      )}

      {/* 軸線（x 底線；y 不畫 domain，照設計稿去掉） */}
      <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke={AXIS_LINE} strokeWidth={1} />
    </>
  );
}

/* ───────────────────────── 水平單系列長條 ───────────────────────── */

function renderHorizontal({
  uid,
  groups,
  colored,
  xLin,
  yBand,
  yTicks,
  innerH,
  colors,
  valueSuffix,
  valueFormat,
}: {
  uid: string;
  groups: string[];
  colored: ColoredSeries[];
  xLin: ReturnType<typeof scaleLinear<number, number>>;
  yBand: ReturnType<typeof scaleBand<string>>;
  yTicks: number[];
  innerH: number;
  colors?: string[];
  valueSuffix: string;
  valueFormat: (v: number) => string;
}) {
  const s0 = colored[0];
  const barH = yBand.bandwidth();
  // 每條顏色：colors[gi] 優先 → 否則整條用 series[0] 解析色
  const colorOf = (gi: number) => colors?.[gi] ?? s0.resolvedColor;

  return (
    <>
      {/* x 軸格線 + 刻度（去 domain/tick line） */}
      {yTicks.map((tv) => (
        <g key={`x-${uid}-${tv}`}>
          <line x1={xLin(tv)} x2={xLin(tv)} y1={0} y2={innerH} stroke={GRID_LINE} strokeDasharray="2 3" />
          <text x={xLin(tv)} y={innerH + 16} textAnchor="middle" fontSize={10} fill="#9A9890">
            {valueFormat(tv)}
          </text>
        </g>
      ))}

      {/* y 軸標籤（11px 灰；去 domain/line） */}
      {groups.map((g, gi) => (
        <text
          key={`y-${uid}-${gi}`}
          x={-8}
          y={(yBand(g) ?? 0) + barH / 2 + 3.5}
          textAnchor="end"
          fontSize={11}
          fill={AXIS_TEXT}
        >
          {g}
        </text>
      ))}

      {/* bars：每列一根橫 rect，由左 scaleX 0→1 伸長到 x(value)，末端帶標籤。
          transform-origin 設在 rect 左緣（0, gy 中線）；delay 依「列序」錯開（設計稿 i*80）。 */}
      {groups.map((g, gi) => {
        const v = s0.values[gi];
        if (typeof v !== "number" || Number.isNaN(v)) return null;
        const fullW = xLin(v);
        const c = colorOf(gi);
        const gy = yBand(g) ?? 0;
        const delay = `${gi * ANIM_STAGGER_MS}ms`;
        return (
          <g key={`row-${uid}-${gi}`}>
            <rect
              x={0}
              y={gy}
              width={fullW}
              height={barH}
              rx={BAR_RADIUS}
              fill={c}
              style={{
                transformOrigin: `0px ${gy + barH / 2}px`,
                transformBox: "view-box",
                animation: `dgb-grow-right-${uid} ${ANIM_MS}ms cubic-bezier(.22,1,.36,1) both`,
                animationDelay: delay,
              }}
            />
            {/* 末端百分比標籤（粗體同色），bar 伸長到位後淡入 */}
            <text
              x={fullW + 6}
              y={gy + barH / 2 + 4}
              fontSize={11}
              fontWeight={700}
              fill={c}
              style={{
                animation: `dgb-fade-in-${uid} ${ANIM_MS}ms ease both`,
                animationDelay: delay,
              }}
            >
              {valueFormat(v)}
              {valueSuffix}
            </text>
          </g>
        );
      })}

      {/* 軸線（y 左線；x 不畫 domain，照設計稿去掉） */}
      <line x1={0} x2={0} y1={0} y2={innerH} stroke={AXIS_LINE} strokeWidth={1} />
    </>
  );
}

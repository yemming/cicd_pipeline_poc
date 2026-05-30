"use client";

/**
 * D3ScatterChart — 可重用散佈圖元件（hybrid：D3 算 scale/extent/mean，React 渲染 SVG）
 *
 * 第十六輪 GRP07/08 個人能效散佈圖共用。Ming 指定用 D3（非 Recharts）為日後酷炫
 * 視覺鋪路。
 *
 * 設計取捨：
 *   - 用 `d3-scale` 的 scaleLinear 算座標映射、`d3-array` 的 mean/extent 算象限切點與
 *     座標域；SVG（<circle>/<path>/<line>/<text>）用 JSX 渲染、tooltip 用 React state。
 *     → 最 React-friendly、不跟 React 搶 DOM、天然支援 StrictMode 雙跑。
 *   - RWD：ResizeObserver 量測容器寬度，svg 用 viewBox 自適應。
 *
 * 診斷四象限（建議書「平均值說謊、散佈圖才說真話」）：
 *   以 x̄ / ȳ（均值）切四象限，淡色填背景 + 均值十字虛線。點依 tag 上色：
 *   明星綠 / 待輔導琥珀 / 危險紅 / 中性灰。
 *
 * 紀律：純前端 presentational component，不 import supabase、不過網路。
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { scaleLinear } from "d3-scale";
import { extent, mean } from "d3-array";

export type ScatterTag = "star" | "watch" | "danger" | "neutral";
export type ScatterMarkerShape = "circle" | "diamond";

/** tag → 點色票（明星綠 / 待輔導琥珀 / 危險紅 / 中性灰）。 */
export const SCATTER_TAG_COLOR: Record<ScatterTag, { fill: string; stroke: string }> = {
  star: { fill: "#0F6E56", stroke: "#0a5742" },
  watch: { fill: "#F59E0B", stroke: "#B45309" },
  danger: { fill: "#CC0000", stroke: "#990000" },
  neutral: { fill: "#9A9890", stroke: "#6B6A68" },
};

export interface D3ScatterChartProps<T> {
  data: T[];
  /** 取 x 軸數值；回 null/NaN 的點視為缺值（過濾掉、不畫） */
  x: (d: T) => number | null;
  /** 取 y 軸數值；回 null/NaN 的點視為缺值（過濾掉、不畫） */
  y: (d: T) => number | null;
  xLabel: string;
  yLabel: string;
  /** 軸刻度格式化（可選） */
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  /** 主色（象限/十字/軸用）— 銷售藍 #1A3A5C / 售後綠 #0F6E56 */
  colorTheme?: string;
  /**
   * 點形狀：銷售圓、SA 菱形。
   *   - 字串：整張圖同一形狀（round-16 既有用法，行為完全不變）。
   *   - 函式：逐點決定形狀（GRP11 跨部門 — 同圖內 ●=銷售 ◆=售後）。
   */
  markerShape?: ScatterMarkerShape | ((d: T) => ScatterMarkerShape);
  /** 點的診斷分類（上色/描邊用）；不給時全部 neutral */
  tagOf?: (d: T) => ScatterTag;
  /** hover tooltip 內容；不給時用 fallbackLabel + 兩軸數值自組 */
  tooltip?: (d: T) => ReactNode;
  /** 沒給 tooltip 時，點的主標題（通常是姓名）；再加門店副標 */
  fallbackLabel?: (d: T) => string;
  fallbackSubLabel?: (d: T) => string | null;
  /**
   * 常駐姓名小標籤（GRP11 跨部門能效用）：給了才在點右側渲染一行小字。
   * 不給時行為與 round-16 完全一致（無標籤）。
   */
  showLabel?: (d: T) => string;
  /** 高度（px）；寬度自適應容器 */
  height?: number;
  /** 沒資料時的訊息 */
  emptyMessage?: string;
}

const DEFAULT_THEME = "#1A3A5C";
const MARGIN = { top: 16, right: 18, bottom: 44, left: 56 };

/** 把 hex 主色淡化成象限底色（4 象限淡藍/灰）。固定 alpha 疊白底近似。 */
function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function D3ScatterChart<T>({
  data,
  x,
  y,
  xLabel,
  yLabel,
  xFormat = (v) => String(Math.round(v * 100) / 100),
  yFormat = (v) => String(Math.round(v * 100) / 100),
  colorTheme = DEFAULT_THEME,
  markerShape = "circle",
  tagOf,
  tooltip,
  fallbackLabel,
  fallbackSubLabel,
  showLabel,
  height = 280,
  emptyMessage = "尚無資料",
}: D3ScatterChartProps<T>) {
  const uid = useId().replace(/[:]/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(420);
  const [hover, setHover] = useState<{ d: T; cx: number; cy: number } | null>(null);

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
    setWidth(el.clientWidth || 420);
    return () => ro.disconnect();
  }, []);

  // 只留兩軸都有有效數值的點
  const points = useMemo(() => {
    const out: Array<{ d: T; vx: number; vy: number; tag: ScatterTag }> = [];
    for (const d of data) {
      const vx = x(d);
      const vy = y(d);
      if (vx == null || vy == null || Number.isNaN(vx) || Number.isNaN(vy)) continue;
      out.push({ d, vx, vy, tag: tagOf ? tagOf(d) : "neutral" });
    }
    return out;
  }, [data, x, y, tagOf]);

  const innerW = Math.max(40, width - MARGIN.left - MARGIN.right);
  const innerH = Math.max(40, height - MARGIN.top - MARGIN.bottom);

  // d3-array extent + pad；單點/全相同值時撐出一個安全區間避免除零
  const { xScale, yScale, xMean, yMean, xTicks, yTicks } = useMemo(() => {
    const xs = points.map((p) => p.vx);
    const ys = points.map((p) => p.vy);

    const padDomain = (raw: [number, number] | [undefined, undefined]): [number, number] => {
      let [lo, hi] = raw[0] === undefined ? [0, 1] : (raw as [number, number]);
      if (lo === hi) {
        // 單點 / 全相同 → 以該值為中心撐開
        const base = Math.abs(lo) > 0 ? Math.abs(lo) * 0.5 : 1;
        lo -= base;
        hi += base;
      } else {
        const pad = (hi - lo) * 0.08;
        lo -= pad;
        hi += pad;
      }
      return [lo, hi];
    };

    const xDom = padDomain(extent(xs) as [number, number] | [undefined, undefined]);
    const yDom = padDomain(extent(ys) as [number, number] | [undefined, undefined]);

    const xScale = scaleLinear().domain(xDom).range([0, innerW]);
    const yScale = scaleLinear().domain(yDom).range([innerH, 0]);

    return {
      xScale,
      yScale,
      xMean: points.length ? (mean(xs) ?? null) : null,
      yMean: points.length ? (mean(ys) ?? null) : null,
      xTicks: xScale.ticks(5),
      yTicks: yScale.ticks(5),
    };
  }, [points, innerW, innerH]);

  const onEnter = useCallback(
    (p: { d: T; vx: number; vy: number }) => {
      setHover({ d: p.d, cx: xScale(p.vx), cy: yScale(p.vy) });
    },
    [xScale, yScale],
  );
  const onLeave = useCallback(() => setHover(null), []);

  // hover 點變動時若資料重算，避免殘留舊 tooltip
  useEffect(() => {
    setHover(null);
  }, [data]);

  if (points.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex items-center justify-center text-[12px] text-[#9A9890] bg-[#F8F7F4] border border-dashed border-[#D5D3CB] rounded-lg"
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  const meanX = xMean != null ? xScale(xMean) : null;
  const meanY = yMean != null ? yScale(yMean) : null;

  const markerPath = (cx: number, cy: number, r: number) => {
    // 菱形 path（以 cx,cy 為中心）
    return `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
  };

  return (
    <div ref={containerRef} className="relative w-full" style={{ minWidth: 0 }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", overflow: "visible" }}
        role="img"
        aria-label={`${xLabel} vs ${yLabel} 散佈圖`}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* 象限背景：以均值十字切 4 區，淡色填（左下危險區帶淡紅、其餘淡主色） */}
          {meanX != null && meanY != null && (
            <g>
              {/* 左下（低-低）= 危險區，淡紅 */}
              <rect x={0} y={meanY} width={meanX} height={innerH - meanY} fill={tint("#CC0000", 0.05)} />
              {/* 右上（高-高）= 明星區，淡綠 */}
              <rect x={meanX} y={0} width={innerW - meanX} height={meanY} fill={tint("#0F6E56", 0.05)} />
              {/* 左上 / 右下 = 中性，淡主色 */}
              <rect x={0} y={0} width={meanX} height={meanY} fill={tint(colorTheme, 0.03)} />
              <rect x={meanX} y={meanY} width={innerW - meanX} height={innerH - meanY} fill={tint(colorTheme, 0.03)} />
            </g>
          )}

          {/* y 軸格線 + 刻度 */}
          {yTicks.map((tv) => (
            <g key={`y-${tv}`}>
              <line
                x1={0}
                x2={innerW}
                y1={yScale(tv)}
                y2={yScale(tv)}
                stroke="#EEECE6"
                strokeDasharray="2 3"
              />
              <text
                x={-8}
                y={yScale(tv) + 3.5}
                textAnchor="end"
                fontSize={10}
                fill="#9A9890"
              >
                {yFormat(tv)}
              </text>
            </g>
          ))}

          {/* x 軸刻度 */}
          {xTicks.map((tv) => (
            <text
              key={`x-${tv}`}
              x={xScale(tv)}
              y={innerH + 16}
              textAnchor="middle"
              fontSize={10}
              fill="#9A9890"
            >
              {xFormat(tv)}
            </text>
          ))}

          {/* 軸線 */}
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="#D5D3CB" strokeWidth={1} />
          <line x1={0} x2={0} y1={0} y2={innerH} stroke="#D5D3CB" strokeWidth={1} />

          {/* 均值十字虛線（x̄ 垂直、ȳ 水平） */}
          {meanX != null && (
            <line
              x1={meanX}
              x2={meanX}
              y1={0}
              y2={innerH}
              stroke={colorTheme}
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.5}
            />
          )}
          {meanY != null && (
            <line
              x1={0}
              x2={innerW}
              y1={meanY}
              y2={meanY}
              stroke={colorTheme}
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.5}
            />
          )}
          {meanX != null && (
            <text x={meanX + 3} y={11} fontSize={9} fill={colorTheme} opacity={0.7}>
              平均
            </text>
          )}

          {/* 資料點 */}
          {points.map((p, i) => {
            const cx = xScale(p.vx);
            const cy = yScale(p.vy);
            const color = SCATTER_TAG_COLOR[p.tag];
            const isHover = hover?.d === p.d;
            const r = isHover ? 7 : 5;
            // 常駐姓名小標籤（GRP11）：給了 showLabel 才渲染，放點右側、小字弱化色
            const label = showLabel ? showLabel(p.d) : null;
            // markerShape 可為字串（整圖同形狀）或函式（逐點決定，GRP11 跨部門用）
            const shape: ScatterMarkerShape =
              typeof markerShape === "function" ? markerShape(p.d) : markerShape;
            const marker =
              shape === "diamond" ? (
                <path
                  d={markerPath(cx, cy, r)}
                  fill={color.fill}
                  stroke={color.stroke}
                  strokeWidth={isHover ? 2 : 1}
                  fillOpacity={0.85}
                  style={{ cursor: "pointer", transition: "d 80ms" }}
                  onMouseEnter={() => onEnter(p)}
                  onMouseLeave={onLeave}
                />
              ) : (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={color.fill}
                  stroke={color.stroke}
                  strokeWidth={isHover ? 2 : 1}
                  fillOpacity={0.85}
                  style={{ cursor: "pointer", transition: "r 80ms" }}
                  onMouseEnter={() => onEnter(p)}
                  onMouseLeave={onLeave}
                />
              );
            return (
              <g key={`pt-${uid}-${i}`}>
                {marker}
                {label ? (
                  <text
                    x={cx + r + 3}
                    y={cy + 3.5}
                    fontSize={9.5}
                    fill="#5A5955"
                    style={{ pointerEvents: "none" }}
                  >
                    {label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* 軸標題 */}
          <text
            x={innerW / 2}
            y={innerH + 36}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill="#5A5955"
          >
            {xLabel}
          </text>
          <text
            transform={`translate(${-44},${innerH / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill="#5A5955"
          >
            {yLabel}
          </text>
        </g>
      </svg>

      {/* tooltip（React state 驅動，絕對定位於點旁） */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-[#EEECE6] bg-white px-2.5 py-1.5 shadow-md"
          style={{
            left: Math.min(MARGIN.left + hover.cx + 10, width - 8),
            top: MARGIN.top + hover.cy - 8,
            maxWidth: 200,
          }}
        >
          {tooltip ? (
            tooltip(hover.d)
          ) : (
            <div className="leading-tight">
              <div className="text-[12px] font-semibold text-[#2C2C2A]">
                {fallbackLabel ? fallbackLabel(hover.d) : "—"}
              </div>
              {fallbackSubLabel && fallbackSubLabel(hover.d) ? (
                <div className="text-[10px] text-[#9A9890]">{fallbackSubLabel(hover.d)}</div>
              ) : null}
              <div className="mt-1 text-[11px] text-[#5A5955]">
                <span className="text-[#9A9890]">{xLabel}：</span>
                {xFormat(x(hover.d) as number)}
              </div>
              <div className="text-[11px] text-[#5A5955]">
                <span className="text-[#9A9890]">{yLabel}：</span>
                {yFormat(y(hover.d) as number)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

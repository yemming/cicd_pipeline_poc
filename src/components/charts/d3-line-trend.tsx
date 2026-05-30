"use client";

/**
 * D3LineTrend — 可重用雙線趨勢圖（本年 current vs 去年同期 prevYear）
 *
 * 第十七輪 GRP09 門店銷售Tab / GRP10 門店售後Tab 月趨勢共用（銷量 / 接車台次…）。
 *
 * 設計取捨（沿用 d3-scatter 的 hybrid 風格）：
 *   - 用 `d3-scale` 算座標映射、`d3-shape` 的 line() + curveMonotoneX 產 path d 字串；
 *     SVG（<path>/<line>/<text>/<circle>）用 JSX 渲染、tooltip 用 React state。
 *     → 最 React-friendly、不跟 React 搶 DOM、天然支援 StrictMode 雙跑。
 *   - RWD：ResizeObserver 量測容器寬度，svg 用 viewBox 自適應。
 *
 * 視覺：本年實線（品牌色）、去年同期虛線（淡灰）；hover 某月顯示雙值 tooltip + 垂直導引線。
 * 空資料安全：無有效點時顯示 emptyMessage 佔位框。
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
} from "react";
import { scaleLinear, scalePoint } from "d3-scale";
import { line, curveMonotoneX } from "d3-shape";

export interface D3LineTrendProps {
  /** x 軸標籤（每月一個，例 "2025-12"） */
  months: string[];
  /** 本年序列（與 months 同長度；null=該月缺值，斷線） */
  current: Array<number | null>;
  /** 去年同期序列（與 months 同長度；null=缺值） */
  prevYear: Array<number | null>;
  /** 圖例 / tooltip 的本年標籤 */
  currentLabel?: string;
  /** 圖例 / tooltip 的去年同期標籤 */
  prevYearLabel?: string;
  /** 數值格式化（tooltip / y 軸刻度共用） */
  valueFormat?: (v: number) => string;
  /** 本年線主色（去年同期固定淡灰）— 銷售藍 #1A3A5C / 售後綠 #0F6E56 */
  colorTheme?: string;
  /** 高度（px）；寬度自適應容器 */
  height?: number;
  /** 沒資料時的訊息 */
  emptyMessage?: string;
}

const DEFAULT_THEME = "#1A3A5C";
const PREV_COLOR = "#9A9890";
const MARGIN = { top: 18, right: 18, bottom: 38, left: 56 };

export function D3LineTrend({
  months,
  current,
  prevYear,
  currentLabel = "本年",
  prevYearLabel = "去年同期",
  valueFormat = (v) => String(Math.round(v * 100) / 100),
  colorTheme = DEFAULT_THEME,
  height = 240,
  emptyMessage = "尚無趨勢資料",
}: D3LineTrendProps) {
  const uid = useId().replace(/[:]/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(420);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

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

  // 資料重算時清掉殘留 hover
  useEffect(() => {
    setHoverIdx(null);
  }, [months, current, prevYear]);

  const innerW = Math.max(40, width - MARGIN.left - MARGIN.right);
  const innerH = Math.max(40, height - MARGIN.top - MARGIN.bottom);

  const { xScale, yScale, currentPath, prevYearPath, yTicks, hasData } = useMemo(() => {
    // 有效數值集合（兩條線聯集）算 y 域
    const allValues: number[] = [];
    for (const v of current) if (v != null && !Number.isNaN(v)) allValues.push(v);
    for (const v of prevYear) if (v != null && !Number.isNaN(v)) allValues.push(v);

    const xScale = scalePoint<string>()
      .domain(months)
      .range([0, innerW])
      .padding(0.5);

    let lo = 0;
    let hi = 1;
    if (allValues.length > 0) {
      lo = Math.min(...allValues);
      hi = Math.max(...allValues);
      if (lo === hi) {
        const base = Math.abs(lo) > 0 ? Math.abs(lo) * 0.5 : 1;
        lo -= base;
        hi += base;
      } else {
        const pad = (hi - lo) * 0.1;
        hi += pad;
        lo -= pad;
      }
      // 趨勢圖常見「量」型 metric，0 基線較直覺：lo>0 時拉到 0
      if (lo > 0 && lo < hi) lo = 0;
    }

    const yScale = scaleLinear().domain([lo, hi]).range([innerH, 0]);

    const xOf = (m: string) => xScale(m) ?? 0;

    // line generator：defined() 過濾 null → 缺值處自動斷線
    const mkPath = (series: Array<number | null>) =>
      line<{ m: string; v: number | null }>()
        .defined((p) => p.v != null && !Number.isNaN(p.v))
        .x((p) => xOf(p.m))
        .y((p) => yScale(p.v as number))
        .curve(curveMonotoneX)(months.map((m, i) => ({ m, v: series[i] ?? null }))) ?? "";

    return {
      xScale,
      yScale,
      currentPath: mkPath(current),
      prevYearPath: mkPath(prevYear),
      yTicks: yScale.ticks(4),
      hasData: allValues.length > 0,
    };
  }, [months, current, prevYear, innerW, innerH]);

  const onMove = useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el || months.length === 0) return;
      const rect = el.getBoundingClientRect();
      // 換算成 svg 內部座標（viewBox 寬 = width）
      const svgX = ((clientX - rect.left) / rect.width) * width - MARGIN.left;
      // 找最近的 month index
      let nearest = 0;
      let best = Infinity;
      months.forEach((m, i) => {
        const px = xScale(m) ?? 0;
        const dist = Math.abs(px - svgX);
        if (dist < best) {
          best = dist;
          nearest = i;
        }
      });
      setHoverIdx(nearest);
    },
    [months, xScale, width],
  );

  if (months.length === 0 || !hasData) {
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

  const hoverMonth = hoverIdx != null ? months[hoverIdx] : null;
  const hoverX = hoverMonth != null ? (xScale(hoverMonth) ?? 0) : null;
  const hoverCur = hoverIdx != null ? current[hoverIdx] ?? null : null;
  const hoverPrev = hoverIdx != null ? prevYear[hoverIdx] ?? null : null;

  // x 軸：點多時抽稀（最多顯示 ~7 個標籤避免重疊）
  const labelStep = Math.max(1, Math.ceil(months.length / 7));

  return (
    <div ref={containerRef} className="relative w-full" style={{ minWidth: 0 }}>
      {/* 圖例 */}
      <div className="mb-1 flex items-center gap-4 text-[11px] text-[#5A5955]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-[2px] w-4 rounded" style={{ background: colorTheme }} />
          {currentLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0 w-4 border-t-2 border-dashed"
            style={{ borderColor: PREV_COLOR }}
          />
          {prevYearLabel}
        </span>
      </div>

      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", overflow: "visible" }}
        role="img"
        aria-label={`${currentLabel} vs ${prevYearLabel} 月趨勢圖`}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* y 軸格線 + 刻度 */}
          {yTicks.map((tv) => (
            <g key={`y-${uid}-${tv}`}>
              <line
                x1={0}
                x2={innerW}
                y1={yScale(tv)}
                y2={yScale(tv)}
                stroke="#EEECE6"
                strokeDasharray="2 3"
              />
              <text x={-8} y={yScale(tv) + 3.5} textAnchor="end" fontSize={10} fill="#9A9890">
                {valueFormat(tv)}
              </text>
            </g>
          ))}

          {/* x 軸刻度（抽稀） */}
          {months.map((m, i) =>
            i % labelStep === 0 || i === months.length - 1 ? (
              <text
                key={`x-${uid}-${i}`}
                x={xScale(m) ?? 0}
                y={innerH + 16}
                textAnchor="middle"
                fontSize={10}
                fill="#9A9890"
              >
                {m}
              </text>
            ) : null,
          )}

          {/* 軸線 */}
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="#D5D3CB" strokeWidth={1} />
          <line x1={0} x2={0} y1={0} y2={innerH} stroke="#D5D3CB" strokeWidth={1} />

          {/* hover 垂直導引線 */}
          {hoverX != null && (
            <line
              x1={hoverX}
              x2={hoverX}
              y1={0}
              y2={innerH}
              stroke={colorTheme}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.4}
            />
          )}

          {/* 去年同期：虛線淡灰（先畫，被本年壓在上層） */}
          <path
            d={prevYearPath}
            fill="none"
            stroke={PREV_COLOR}
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
          {/* 本年：實線品牌色 */}
          <path d={currentPath} fill="none" stroke={colorTheme} strokeWidth={2} />

          {/* 資料點（本年實心、去年同期空心） */}
          {months.map((m, i) => {
            const cv = current[i];
            const pv = prevYear[i];
            const px = xScale(m) ?? 0;
            const isHover = hoverIdx === i;
            return (
              <g key={`pt-${uid}-${i}`}>
                {pv != null && !Number.isNaN(pv) ? (
                  <circle
                    cx={px}
                    cy={yScale(pv)}
                    r={isHover ? 3.5 : 2.5}
                    fill="#fff"
                    stroke={PREV_COLOR}
                    strokeWidth={1.5}
                  />
                ) : null}
                {cv != null && !Number.isNaN(cv) ? (
                  <circle
                    cx={px}
                    cy={yScale(cv)}
                    r={isHover ? 4 : 3}
                    fill={colorTheme}
                    stroke="#fff"
                    strokeWidth={1}
                  />
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>

      {/* tooltip（React state 驅動） */}
      {hoverMonth != null && hoverX != null && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-[#EEECE6] bg-white px-2.5 py-1.5 shadow-md"
          style={{
            left: Math.min(MARGIN.left + hoverX + 10, width - 8),
            top: MARGIN.top,
            maxWidth: 180,
          }}
        >
          <div className="text-[11px] font-semibold text-[#2C2C2A]">{hoverMonth}</div>
          <div className="mt-0.5 text-[11px] text-[#5A5955]">
            <span className="inline-block h-[2px] w-3 align-middle rounded" style={{ background: colorTheme }} />
            <span className="ml-1 text-[#9A9890]">{currentLabel}：</span>
            {hoverCur != null ? valueFormat(hoverCur) : "—"}
          </div>
          <div className="text-[11px] text-[#5A5955]">
            <span
              className="inline-block h-0 w-3 align-middle border-t-2 border-dashed"
              style={{ borderColor: PREV_COLOR }}
            />
            <span className="ml-1 text-[#9A9890]">{prevYearLabel}：</span>
            {hoverPrev != null ? valueFormat(hoverPrev) : "—"}
          </div>
        </div>
      )}
    </div>
  );
}

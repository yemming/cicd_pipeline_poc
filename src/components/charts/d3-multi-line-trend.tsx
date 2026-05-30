"use client";

/**
 * D3MultiLineTrend — 可重用多系列折線趨勢圖（hybrid：D3 算 scale/path，React 渲染 SVG）
 *
 * 第十八輪 集團策略評估層 · 跨季健康分數趨勢（多門店多系列）共用。是 d3-line-trend
 * 的多系列泛化版：任意數量系列、各自顏色、可選警戒線、hover 導引線顯示某季各系列值。
 *
 * 設計取捨（沿用 d3-line-trend 的 hybrid 風格）：
 *   - 用 d3-scale 的 scalePoint(x) / scaleLinear(y)、d3-shape 的 line() + curveMonotoneX
 *     產 path d；SVG 用 JSX 渲染、tooltip 用 React state。
 *   - RWD：ResizeObserver 量容器寬，svg 用 viewBox 自適應。
 *   - 空安全：無系列 / 無有效點時顯示佔位框。
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

export interface MultiLineSeries {
  /** 系列名稱（圖例 / tooltip / 末端標籤） */
  name: string;
  /** 與 x 同長度的值序列；null=該 x 缺值（斷線） */
  values: Array<number | null>;
  /** 線色（不給時用 colors palette 輪替） */
  color?: string;
}

export interface D3MultiLineTrendProps {
  /** x 軸標籤（每季一個，例 "2025 Q1"） */
  x: string[];
  /** 多系列 */
  series: MultiLineSeries[];
  /** 數值格式化（tooltip / y 軸刻度 / 末端標籤共用） */
  valueFormat?: (v: number) => string;
  /** 高度（px）；寬度自適應容器 */
  height?: number;
  /** 警戒線（給了畫一條水平虛紅線） */
  warnLine?: number;
  /** 系列無自帶 color 時的輪替色盤 */
  colors?: string[];
  /** 沒資料時的訊息 */
  emptyMessage?: string;
}

const DEFAULT_COLORS = [
  "#1A3A5C",
  "#0F6E56",
  "#B45309",
  "#185FA5",
  "#CC0000",
  "#854F0B",
  "#3B6D11",
  "#6B6A68",
];
const WARN_COLOR = "#CC0000";
// 右側預留末端系列標籤空間
const MARGIN = { top: 18, right: 70, bottom: 38, left: 52 };

export function D3MultiLineTrend({
  x,
  series,
  valueFormat = (v) => String(Math.round(v * 100) / 100),
  height = 260,
  warnLine,
  colors = DEFAULT_COLORS,
  emptyMessage = "尚無趨勢資料",
}: D3MultiLineTrendProps) {
  const uid = useId().replace(/[:]/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(480);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

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
    setWidth(el.clientWidth || 480);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setHoverIdx(null);
  }, [x, series]);

  const innerW = Math.max(40, width - MARGIN.left - MARGIN.right);
  const innerH = Math.max(40, height - MARGIN.top - MARGIN.bottom);

  // 系列補上顏色（caller 沒給就用色盤輪替）
  const colored = useMemo(
    () =>
      series.map((s, i) => ({
        ...s,
        resolvedColor: s.color ?? colors[i % colors.length],
      })),
    [series, colors],
  );

  const { xScale, yScale, paths, yTicks, hasData } = useMemo(() => {
    const allValues: number[] = [];
    for (const s of series) {
      for (const v of s.values) {
        if (v != null && !Number.isNaN(v)) allValues.push(v);
      }
    }
    if (warnLine != null && !Number.isNaN(warnLine)) allValues.push(warnLine);

    const xScale = scalePoint<string>().domain(x).range([0, innerW]).padding(0.5);

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
      if (lo > 0 && lo < hi) lo = 0;
    }

    const yScale = scaleLinear().domain([lo, hi]).range([innerH, 0]);
    const xOf = (m: string) => xScale(m) ?? 0;

    const mkPath = (values: Array<number | null>) =>
      line<{ m: string; v: number | null }>()
        .defined((p) => p.v != null && !Number.isNaN(p.v))
        .x((p) => xOf(p.m))
        .y((p) => yScale(p.v as number))
        .curve(curveMonotoneX)(x.map((m, i) => ({ m, v: values[i] ?? null }))) ?? "";

    return {
      xScale,
      yScale,
      paths: colored.map((s) => mkPath(s.values)),
      yTicks: yScale.ticks(4),
      hasData: allValues.length > 0,
    };
  }, [x, series, colored, innerW, innerH, warnLine]);

  const onMove = useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el || x.length === 0) return;
      const rect = el.getBoundingClientRect();
      const svgX = ((clientX - rect.left) / rect.width) * width - MARGIN.left;
      let nearest = 0;
      let best = Infinity;
      x.forEach((m, i) => {
        const px = xScale(m) ?? 0;
        const dist = Math.abs(px - svgX);
        if (dist < best) {
          best = dist;
          nearest = i;
        }
      });
      setHoverIdx(nearest);
    },
    [x, xScale, width],
  );

  if (x.length === 0 || series.length === 0 || !hasData) {
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

  const hoverX = hoverIdx != null ? (xScale(x[hoverIdx]) ?? 0) : null;
  const labelStep = Math.max(1, Math.ceil(x.length / 7));

  // 末端標籤：每系列最後一個非空值的位置
  const endLabels = colored.map((s) => {
    for (let i = s.values.length - 1; i >= 0; i--) {
      const v = s.values[i];
      if (v != null && !Number.isNaN(v)) {
        return { name: s.name, color: s.resolvedColor, x: xScale(x[i]) ?? 0, y: yScale(v) };
      }
    }
    return null;
  });

  return (
    <div ref={containerRef} className="relative w-full" style={{ minWidth: 0 }}>
      {/* 圖例 */}
      <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#5A5955]">
        {colored.map((s) => (
          <span key={`lg-${uid}-${s.name}`} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-[2px] w-4 rounded"
              style={{ background: s.resolvedColor }}
            />
            {s.name}
          </span>
        ))}
        {warnLine != null ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0 w-4 border-t-2 border-dashed"
              style={{ borderColor: WARN_COLOR }}
            />
            警戒線
          </span>
        ) : null}
      </div>

      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", overflow: "visible" }}
        role="img"
        aria-label="多系列趨勢圖"
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
          {x.map((m, i) =>
            i % labelStep === 0 || i === x.length - 1 ? (
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

          {/* 警戒線 */}
          {warnLine != null && !Number.isNaN(warnLine) ? (
            <line
              x1={0}
              x2={innerW}
              y1={yScale(warnLine)}
              y2={yScale(warnLine)}
              stroke={WARN_COLOR}
              strokeWidth={1.2}
              strokeDasharray="5 4"
              opacity={0.7}
            />
          ) : null}

          {/* hover 垂直導引線 */}
          {hoverX != null && (
            <line
              x1={hoverX}
              x2={hoverX}
              y1={0}
              y2={innerH}
              stroke="#5A5955"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.35}
            />
          )}

          {/* 各系列線 */}
          {colored.map((s, si) => (
            <path
              key={`line-${uid}-${si}`}
              d={paths[si]}
              fill="none"
              stroke={s.resolvedColor}
              strokeWidth={2}
            />
          ))}

          {/* hover 季：各系列點高亮 */}
          {hoverIdx != null
            ? colored.map((s, si) => {
                const v = s.values[hoverIdx];
                if (v == null || Number.isNaN(v)) return null;
                return (
                  <circle
                    key={`hp-${uid}-${si}`}
                    cx={xScale(x[hoverIdx]) ?? 0}
                    cy={yScale(v)}
                    r={3.5}
                    fill={s.resolvedColor}
                    stroke="#fff"
                    strokeWidth={1}
                  />
                );
              })
            : null}

          {/* 末端系列標籤 */}
          {endLabels.map((el, i) =>
            el ? (
              <text
                key={`end-${uid}-${i}`}
                x={el.x + 6}
                y={el.y + 3}
                fontSize={9.5}
                fontWeight={600}
                fill={el.color}
              >
                {el.name}
              </text>
            ) : null,
          )}
        </g>
      </svg>

      {/* tooltip：某季各系列值 */}
      {hoverIdx != null && hoverX != null && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-[#EEECE6] bg-white px-2.5 py-1.5 shadow-md"
          style={{
            left: Math.min(MARGIN.left + hoverX + 10, width - 8),
            top: MARGIN.top,
            maxWidth: 200,
          }}
        >
          <div className="text-[11px] font-semibold text-[#2C2C2A]">{x[hoverIdx]}</div>
          <div className="mt-0.5 space-y-0.5">
            {colored.map((s) => {
              const v = s.values[hoverIdx];
              return (
                <div key={`tt-${uid}-${s.name}`} className="text-[11px] text-[#5A5955]">
                  <span
                    className="inline-block h-[2px] w-3 align-middle rounded"
                    style={{ background: s.resolvedColor }}
                  />
                  <span className="ml-1 text-[#9A9890]">{s.name}：</span>
                  {v != null && !Number.isNaN(v) ? valueFormat(v) : "—"}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

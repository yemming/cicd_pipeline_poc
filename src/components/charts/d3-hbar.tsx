"use client";

/**
 * D3HBar — 可重用水平長條圖（支援正負值 / 零線 / 參考線 / 警示區 / 逐條色）
 *
 * 第二十輪 GRP12 周轉率 bar（目標 6.0 參考線）/ 車型別加裝率（依值上色）
 * + GRP14 門店成交偏差率（含零線、警戒線、低於下限的紅色警示區、正負雙色）共用。
 *
 * 與 d3-grouped-bar 的 horizontal 變體差異：本元件支援
 *   - 「負值」：bars 從 x=0（零位）往左長（偏差 -4.8% 往左）。
 *   - 「零線」：x=0 處畫一條軸線（domain 跨零時）。
 *   - 「參考線」refLines：任意 x 值畫垂直虛線（目標 6.0 / 警戒 -3%）。
 *   - 「警示區」warningZone：x 區間鋪淡色底（低於下限的紅區）。
 *   - colorFn：依資料值決定每條色（正綠負紅 / 達標分級）。
 *
 * 設計取捨（沿用 d3-line-trend / d3-grouped-bar 的 hybrid 風格）：
 *   - d3-scale 算座標；SVG（rect/line/text）用 JSX 渲染，不跟 React 搶 DOM、支援 StrictMode 雙跑。
 *   - 伸長動畫純 CSS @keyframes（scaleX from 0）；dataKey 當 <g> React key → 資料變動 remount 重播。
 *   - RWD：ResizeObserver 量容器寬，viewBox 自適應。空安全 / 確定性格式化（不用 toLocaleString）。
 *
 * 紀律：純前端 presentational component，不 import supabase、不過網路。
 */

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { scaleBand, scaleLinear } from "d3-scale";

export interface HBarDatum {
  /** 列標籤（門店名 / 車型名） */
  label: string;
  /** 值（可正可負） */
  value: number;
  /** 該列顏色（優先於 colorFn / 預設色） */
  color?: string;
}

export interface HBarRefLine {
  /** 參考線的 x 值（目標 6.0 / 警戒 -3） */
  value: number;
  /** 線旁標籤（例「目標 6.0」「警戒」） */
  label?: string;
  /** 線色，預設 amber #854F0B */
  color?: string;
}

export interface D3HBarProps {
  data: HBarDatum[];
  /** 高度（px）；寬度自適應容器 */
  height?: number;
  /** 末端值標籤後綴，例 "%" / "次" */
  valueSuffix?: string;
  /** 數值格式化（軸刻度 / 末端標籤共用），預設四捨五入整數 */
  valueFormat?: (v: number) => string;
  /** 參考線（目標 / 警戒），可多條 */
  refLines?: HBarRefLine[];
  /** 警示區間（x 從 from 到 to 鋪淡色底；常用於「低於下限」紅區） */
  warningZone?: { from: number; to: number; color?: string };
  /** 依值決定每條色（正負色 / 達標分級）；datum.color 優先於此 */
  colorFn?: (d: HBarDatum) => string;
  /** 強制 x 域 [min,max]；不給則自動（跨零時含 0） */
  domain?: [number, number];
  /** 單一預設色（colorFn / datum.color / colors 都沒給時） */
  baseColor?: string;
  /** 沒資料時的訊息 */
  emptyMessage?: string;
  /** 外層容器額外 className */
  className?: string;
}

const AXIS_TEXT = "#5A5A5A";
const AXIS_LINE = "#D5D3CB";
const GRID_LINE = "#EEECE6";
const ZERO_LINE = "#9A9890";
const BAR_RADIUS = 3;
const ANIM_MS = 700;
const ANIM_STAGGER_MS = 90;
const MARGIN = { top: 14, right: 56, bottom: 24, left: 92 };

function defaultFormat(v: number): string {
  return String(Math.round(v));
}

export function D3HBar({
  data,
  height = 240,
  valueSuffix = "",
  valueFormat = defaultFormat,
  refLines = [],
  warningZone,
  colorFn,
  domain,
  baseColor = "#1A3A5C",
  emptyMessage = "尚無資料",
  className,
}: D3HBarProps) {
  const uid = useId().replace(/[:]/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(480);

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

  const innerW = Math.max(40, width - MARGIN.left - MARGIN.right);
  const innerH = Math.max(40, height - MARGIN.top - MARGIN.bottom);

  const { xLin, yBand, xTicks, zeroX, hasData } = useMemo(() => {
    const vals = data.map((d) => d.value).filter((v) => typeof v === "number" && !Number.isNaN(v));
    let lo: number;
    let hi: number;
    if (domain) {
      [lo, hi] = domain;
    } else if (vals.length === 0) {
      lo = 0;
      hi = 1;
    } else {
      const minV = Math.min(...vals, ...refLines.map((r) => r.value));
      const maxV = Math.max(...vals, ...refLines.map((r) => r.value));
      // 含零基線；正資料 lo=0，含負值時往負側留 10% pad
      lo = minV < 0 ? minV * 1.15 : 0;
      hi = maxV > 0 ? maxV * 1.15 : 0;
      if (lo === hi) hi = lo + 1;
    }
    const xLin = scaleLinear().domain([lo, hi]).range([0, innerW]);
    const yBand = scaleBand<string>()
      .domain(data.map((d) => d.label))
      .range([0, innerH])
      .padding(0.35);
    return {
      xLin,
      yBand,
      xTicks: xLin.ticks(4),
      zeroX: xLin(0),
      hasData: vals.length > 0,
    };
  }, [data, domain, refLines, innerW, innerH]);

  if (data.length === 0 || !hasData) {
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

  const barH = yBand.bandwidth();
  const colorOf = (d: HBarDatum) => d.color ?? colorFn?.(d) ?? baseColor;
  const dataKey = data.map((d) => `${d.label}:${d.value}`).join("|");

  return (
    <div ref={containerRef} className={`relative w-full ${className ?? ""}`} style={{ minWidth: 0 }}>
      <style>{`
        @keyframes hbar-grow-${uid} { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes hbar-fade-${uid} { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", overflow: "visible" }}
        role="img"
        aria-label="水平長條圖"
      >
        <g key={dataKey} transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* 警示區（先畫、墊最底） */}
          {warningZone
            ? (() => {
                const x1 = xLin(Math.min(warningZone.from, warningZone.to));
                const x2 = xLin(Math.max(warningZone.from, warningZone.to));
                return (
                  <rect
                    x={x1}
                    y={0}
                    width={Math.max(0, x2 - x1)}
                    height={innerH}
                    fill={warningZone.color ?? "rgba(200,0,26,0.06)"}
                  />
                );
              })()
            : null}

          {/* x 軸格線 + 刻度 */}
          {xTicks.map((tv) => (
            <g key={`x-${uid}-${tv}`}>
              <line x1={xLin(tv)} x2={xLin(tv)} y1={0} y2={innerH} stroke={GRID_LINE} strokeDasharray="2 3" />
              <text x={xLin(tv)} y={innerH + 16} textAnchor="middle" fontSize={10} fill="#9A9890">
                {valueFormat(tv)}
              </text>
            </g>
          ))}

          {/* y 軸標籤 */}
          {data.map((d) => (
            <text
              key={`y-${uid}-${d.label}`}
              x={-8}
              y={(yBand(d.label) ?? 0) + barH / 2 + 3.5}
              textAnchor="end"
              fontSize={11}
              fill={AXIS_TEXT}
            >
              {d.label}
            </text>
          ))}

          {/* bars：從零位 zeroX 往正(右)/負(左)長 */}
          {data.map((d, gi) => {
            if (typeof d.value !== "number" || Number.isNaN(d.value)) return null;
            const vx = xLin(d.value);
            const x = Math.min(zeroX, vx);
            const w = Math.abs(vx - zeroX);
            const gy = yBand(d.label) ?? 0;
            const c = colorOf(d);
            const isNeg = d.value < 0;
            const delay = `${gi * ANIM_STAGGER_MS}ms`;
            // transform-origin：正值左緣(zeroX)、負值右緣(zeroX) → 都從零位長出
            return (
              <g key={`row-${uid}-${gi}`}>
                <rect
                  x={x}
                  y={gy}
                  width={Math.max(w, 0.5)}
                  height={barH}
                  rx={BAR_RADIUS}
                  fill={c}
                  style={{
                    transformOrigin: `${zeroX}px ${gy + barH / 2}px`,
                    transformBox: "view-box",
                    animation: `hbar-grow-${uid} ${ANIM_MS}ms cubic-bezier(.22,1,.36,1) both`,
                    animationDelay: delay,
                  }}
                />
                <text
                  x={isNeg ? x - 6 : x + w + 6}
                  y={gy + barH / 2 + 4}
                  textAnchor={isNeg ? "end" : "start"}
                  fontSize={11}
                  fontWeight={700}
                  fill={c}
                  style={{
                    animation: `hbar-fade-${uid} ${ANIM_MS}ms ease both`,
                    animationDelay: delay,
                  }}
                >
                  {d.value > 0 ? "+" : ""}
                  {valueFormat(d.value)}
                  {valueSuffix}
                </text>
              </g>
            );
          })}

          {/* 參考線（目標 / 警戒，垂直虛線 + 標籤） */}
          {refLines.map((r, i) => {
            const rx = xLin(r.value);
            const col = r.color ?? "#854F0B";
            return (
              <g key={`ref-${uid}-${i}`}>
                <line x1={rx} x2={rx} y1={0} y2={innerH} stroke={col} strokeWidth={1.5} strokeDasharray="4 3" />
                {r.label ? (
                  <text x={rx + 3} y={-3} fontSize={10} fill={col}>
                    {r.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* 零線（domain 跨零時畫，蓋在格線上） */}
          {zeroX > 0.5 && zeroX < innerW - 0.5 ? (
            <line x1={zeroX} x2={zeroX} y1={0} y2={innerH} stroke={ZERO_LINE} strokeWidth={1.5} />
          ) : null}

          {/* 左軸線 */}
          <line x1={0} x2={0} y1={0} y2={innerH} stroke={AXIS_LINE} strokeWidth={1} />
        </g>
      </svg>
    </div>
  );
}

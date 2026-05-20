"use client";

import { useMemo } from "react";
import { type ChartSize, type ChartTone, SIZE_HEIGHT, heatmapColor } from "./chart-tokens";

export interface HeatMapDatum {
  /** column label（例：1~31 日、Mon~Sun、店點 1~N） */
  x: string | number;
  /** row label（例：時段、品類、車型） */
  y: string | number;
  /** 強度值；元件會自動 normalize 到 0~1 套色階 */
  value: number;
}

export interface HeatMapProps {
  data: HeatMapDatum[];
  tone?: ChartTone;
  size?: ChartSize;
  /** 顯示 tooltip（用 native title） */
  showTooltip?: boolean;
  /** cell 內顯示數值 */
  showValues?: boolean;
  /** 強制指定最大值（不填則用 data 中最大）；用於跨 heatmap 對齊色階 */
  maxValue?: number;
  /** cell 之間的間隙 px */
  gap?: number;
  className?: string;
}

/**
 * HeatMap — recharts 無原生 heatmap，自寫 SVG grid。
 * 強度低 → 高 = tone-{tone}-100 → tone-{tone}-700（heatmapColor helper）。
 *
 * 適用：時段熱力（24×7）、月份×品類銷售熱度、店點×時段預約密度。
 */
export function HeatMap({
  data,
  tone = "blue",
  size = "md",
  showTooltip = true,
  showValues = false,
  maxValue,
  gap = 2,
  className,
}: HeatMapProps) {
  const { xLabels, yLabels, grid, vMax } = useMemo(() => {
    const xSet = Array.from(new Set(data.map((d) => d.x)));
    const ySet = Array.from(new Set(data.map((d) => d.y)));
    const max = maxValue ?? Math.max(0, ...data.map((d) => d.value));
    const lookup = new Map<string, number>();
    for (const d of data) lookup.set(`${d.x}|${d.y}`, d.value);
    const g = ySet.map((y) =>
      xSet.map((x) => ({
        x,
        y,
        value: lookup.get(`${x}|${y}`) ?? 0,
      })),
    );
    return { xLabels: xSet, yLabels: ySet, grid: g, vMax: max };
  }, [data, maxValue]);

  const height = SIZE_HEIGHT[size];
  const labelW = 56; // y 軸標籤欄寬
  const labelH = 18; // x 軸標籤列高

  return (
    <div className={className} style={{ width: "100%", height }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${labelW}px 1fr`,
          gridTemplateRows: `${labelH}px 1fr`,
          width: "100%",
          height: "100%",
        }}
      >
        {/* 左上角空格 */}
        <div />
        {/* x 軸 label row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${xLabels.length}, 1fr)`,
            gap,
            alignItems: "end",
          }}
        >
          {xLabels.map((x, i) => (
            <div
              key={i}
              className="text-[10px] text-[#9A9890] text-center truncate"
              title={String(x)}
            >
              {x}
            </div>
          ))}
        </div>
        {/* y 軸 label col */}
        <div
          style={{
            display: "grid",
            gridTemplateRows: `repeat(${yLabels.length}, 1fr)`,
            gap,
            alignItems: "center",
          }}
        >
          {yLabels.map((y, i) => (
            <div
              key={i}
              className="text-[10px] text-[#9A9890] pr-2 text-right truncate"
              title={String(y)}
            >
              {y}
            </div>
          ))}
        </div>
        {/* heat cells */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${xLabels.length}, 1fr)`,
            gridTemplateRows: `repeat(${yLabels.length}, 1fr)`,
            gap,
          }}
        >
          {grid.flat().map((cell, i) => {
            const t = vMax > 0 ? cell.value / vMax : 0;
            const bg = heatmapColor(tone, t);
            return (
              <div
                key={i}
                title={showTooltip ? `${cell.x} · ${cell.y}: ${cell.value}` : undefined}
                style={{
                  background: bg,
                  borderRadius: 3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  color: t > 0.55 ? "#fff" : "#2C2C2A",
                  cursor: showTooltip ? "default" : undefined,
                }}
              >
                {showValues ? cell.value : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  type ChartSize,
  type ChartTone,
  SERIES_COLORS,
  SIZE_HEIGHT,
  TONE_HEX,
  TOOLTIP_STYLE,
} from "./chart-tokens";

export interface DonutDatum {
  name: string;
  value: number;
  /** 強制指定顏色，不填則照 SERIES_COLORS 循環 */
  color?: string;
}

export interface DonutChartProps {
  data: DonutDatum[];
  tone?: ChartTone;
  size?: ChartSize;
  showLegend?: boolean;
  showTooltip?: boolean;
  /** 中央文字（總計、達成率…），會以 absolute 蓋在 donut 中心 */
  centerLabel?: string;
  /** 中央副標 */
  centerCaption?: string;
  /** 內外圈百分比（vs 容器最短邊的一半），預設 inner=60% / outer=88% */
  innerRadiusPct?: number;
  outerRadiusPct?: number;
  className?: string;
}

/**
 * DonutChart — 百分比 / 結構分佈用。多 segment 走 SERIES_COLORS 循環，
 * 單 segment + tone 時取 tone-500 + tone-100 的對比配色。
 * centerLabel 用 absolute 疊在中央，比 recharts 內建 label 好控字級。
 */
export function DonutChart({
  data,
  tone = "blue",
  size = "md",
  showLegend = false,
  showTooltip = true,
  centerLabel,
  centerCaption,
  innerRadiusPct = 60,
  outerRadiusPct = 88,
  className,
}: DonutChartProps) {
  const height = SIZE_HEIGHT[size];
  const isSingleSegment = data.length === 1;

  return (
    <div className={className} style={{ position: "relative", width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          {showTooltip ? <Tooltip contentStyle={TOOLTIP_STYLE} /> : null}
          {showLegend ? <Legend wrapperStyle={{ fontSize: 11, color: "#5A5955" }} iconSize={10} /> : null}
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={`${innerRadiusPct}%`}
            outerRadius={`${outerRadiusPct}%`}
            paddingAngle={data.length > 1 ? 2 : 0}
            stroke="#fff"
            strokeWidth={2}
            isAnimationActive={true}
            animationDuration={700}
          >
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={
                  d.color ??
                  (isSingleSegment
                    ? TONE_HEX[tone][500]
                    : SERIES_COLORS[i % SERIES_COLORS.length])
                }
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {centerLabel || centerCaption ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          {centerLabel ? (
            <div className="text-[20px] font-semibold text-[#2C2C2A] leading-tight">{centerLabel}</div>
          ) : null}
          {centerCaption ? (
            <div className="text-[11px] text-[#9A9890] mt-0.5">{centerCaption}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

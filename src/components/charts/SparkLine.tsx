"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { type ChartTone, TONE_HEX } from "./chart-tokens";

export interface SparkLineProps {
  /** 一維數列（最常見）；或 {value} 物件陣列 */
  data: number[] | Array<{ value: number }>;
  tone?: ChartTone;
  /** 自訂高度 px，預設 32 — KPI card 內嵌用 */
  height?: number;
  /** stroke 寬度，預設 1.5 */
  strokeWidth?: number;
  /** 直線 vs 平滑（monotone）；預設平滑 */
  smooth?: boolean;
  className?: string;
}

/**
 * SparkLine — 極簡 mini line chart，無 axis / legend / tooltip。
 * 給 KPI card / table cell 內嵌走勢用。
 *
 * <SparkLine data={[3,5,4,7,9,8,12]} tone="teal" />
 */
export function SparkLine({
  data,
  tone = "blue",
  height = 32,
  strokeWidth = 1.5,
  smooth = true,
  className,
}: SparkLineProps) {
  const normalized: Array<{ value: number }> = Array.isArray(data) && typeof data[0] === "number"
    ? (data as number[]).map((v) => ({ value: v }))
    : (data as Array<{ value: number }>);
  const color = TONE_HEX[tone][500];

  return (
    <div className={className} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={normalized} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type={smooth ? "monotone" : "linear"}
            dataKey="value"
            stroke={color}
            strokeWidth={strokeWidth}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

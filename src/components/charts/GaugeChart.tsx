"use client";

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { type ChartSize, type ChartTone, SIZE_HEIGHT, TONE_HEX } from "./chart-tokens";

export interface GaugeChartProps {
  /** 0~max 之間的當前值 */
  value: number;
  /** 滿值（預設 100，例：完成率） */
  max?: number;
  tone?: ChartTone;
  size?: ChartSize;
  /** 半圓（180°）vs 整圓（360°）；預設半圓，符合一般 gauge 直覺 */
  variant?: "half" | "full";
  /** 中央主文字（不填則自動算 ${value}/${max}） */
  label?: string;
  /** 中央副標 */
  caption?: string;
  /** value 是否已是百分比（0~100）；預設 false = 自動算 value/max */
  isPercent?: boolean;
  className?: string;
}

/**
 * GaugeChart — KPI 達成率 / 進度條 / 庫存水位用。
 * 用 recharts 的 RadialBarChart + PolarAngleAxis 限制角度做半圓 gauge。
 *
 * <GaugeChart value={74} tone="teal" caption="完成率" />
 */
export function GaugeChart({
  value,
  max = 100,
  tone = "blue",
  size = "md",
  variant = "half",
  label,
  caption,
  isPercent = false,
  className,
}: GaugeChartProps) {
  const height = SIZE_HEIGHT[size];
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const data = [{ name: "value", value: pct, fill: TONE_HEX[tone][500] }];
  const isHalf = variant === "half";

  return (
    <div className={className} style={{ position: "relative", width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          startAngle={isHalf ? 180 : 90}
          endAngle={isHalf ? 0 : -270}
          innerRadius="65%"
          outerRadius="100%"
          barSize={18}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={10}
            background={{ fill: TONE_HEX[tone][100] }}
            fill={TONE_HEX[tone][500]}
            isAnimationActive={true}
            animationDuration={700}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: isHalf ? "flex-end" : "center",
          paddingBottom: isHalf ? "12%" : 0,
          pointerEvents: "none",
        }}
      >
        <div
          className="font-semibold leading-tight"
          style={{ color: TONE_HEX[tone][700], fontSize: size === "sm" ? 18 : size === "lg" ? 32 : 24 }}
        >
          {label ?? (isPercent ? `${value}%` : `${value}/${max}`)}
        </div>
        {caption ? <div className="text-[11px] text-[#9A9890] mt-0.5">{caption}</div> : null}
      </div>
    </div>
  );
}

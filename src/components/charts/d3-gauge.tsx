"use client";

/**
 * D3Gauge — 可重用半圓 / 270° 儀表盤（hybrid：D3 算 arc path，React 渲染 SVG）
 *
 * 第十八輪 集團策略評估層 · 門店綜合健康分數儀表卡共用。
 *
 * 設計取捨（沿用 hybrid 風格）：
 *   - 用 d3-shape 的 arc() 產背景弧 + 值弧的 path d 字串；SVG 用 JSX 渲染。
 *   - 270° 弧（從左下 -135° 掃到右下 +135°），值弧依分級門檻上色。
 *   - 中央大數字 + 可選 delta（環比，▲綠 / ▼紅 / →灰）。
 *   - 空安全：value 為 null 顯示「—」。
 *
 * 紀律：純前端 presentational component，不 import supabase、不過網路。
 */

import { useMemo } from "react";
import { arc, type DefaultArcObject } from "d3-shape";

export interface GaugeThreshold {
  /** 達到此值（含）以上時套 color；多個門檻由小到大排序生效 */
  at: number;
  color: string;
}

export interface D3GaugeProps {
  /** 主數值；null/NaN 顯示「—」、值弧不畫 */
  value: number | null;
  /** 量程下限，預設 0 */
  min?: number;
  /** 量程上限，預設 100 */
  max?: number;
  /** 中央數字下方標籤（例「綜合健康分數」） */
  label?: string;
  /** 環比變化（給了在中央數字旁顯示 ▲/▼/→） */
  delta?: number;
  /** 分級門檻（值落在哪段就用該段色）；不給時用內建三段（紅/琥珀/綠） */
  thresholds?: GaugeThreshold[];
  /** 整體尺寸 px，預設 150 */
  size?: number;
}

// 270° 弧：起 -135°、止 +135°（以正上方為 0、順時針為正）
const START_ANGLE = (-135 * Math.PI) / 180;
const END_ANGLE = (135 * Math.PI) / 180;

const DEFAULT_THRESHOLDS: GaugeThreshold[] = [
  { at: 0, color: "#CC0000" },
  { at: 50, color: "#F59E0B" },
  { at: 75, color: "#0F6E56" },
];

/** 依門檻挑色（取 value >= at 中最大 at 的那段）。 */
function pickColor(value: number, thresholds: GaugeThreshold[]): string {
  const sorted = [...thresholds].sort((a, b) => a.at - b.at);
  let color = sorted[0]?.color ?? "#1A3A5C";
  for (const t of sorted) {
    if (value >= t.at) color = t.color;
  }
  return color;
}

export function D3Gauge({
  value,
  min = 0,
  max = 100,
  label,
  delta,
  thresholds = DEFAULT_THRESHOLDS,
  size = 150,
}: D3GaugeProps) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 6;
  const innerR = outerR - Math.max(8, size * 0.09);

  const hasValue = value != null && !Number.isNaN(value);
  const clamped = hasValue ? Math.max(min, Math.min(max, value as number)) : min;
  const frac = max > min ? (clamped - min) / (max - min) : 0;
  const valueAngle = START_ANGLE + frac * (END_ANGLE - START_ANGLE);

  const { bgPath, valuePath, valueColor } = useMemo(() => {
    // 半徑 / 起止角都設成常數 → 產生器可吃任意 datum；給一個 DefaultArcObject 形狀的空殼即可
    const dummy: DefaultArcObject = {
      innerRadius: innerR,
      outerRadius: outerR,
      startAngle: START_ANGLE,
      endAngle: END_ANGLE,
    };
    const bgArc = arc()
      .innerRadius(innerR)
      .outerRadius(outerR)
      .startAngle(START_ANGLE)
      .endAngle(END_ANGLE)
      .cornerRadius(2);
    const valArc = arc()
      .innerRadius(innerR)
      .outerRadius(outerR)
      .startAngle(START_ANGLE)
      .endAngle(valueAngle)
      .cornerRadius(2);
    // d3 arc 的 angle 以「12 點方向為 0、順時針」與我們定義一致
    return {
      bgPath: bgArc(dummy) ?? "",
      valuePath: hasValue ? (valArc(dummy) ?? "") : "",
      valueColor: hasValue ? pickColor(clamped, thresholds) : "#9A9890",
    };
  }, [innerR, outerR, valueAngle, hasValue, clamped, thresholds]);

  const deltaNode =
    delta != null && !Number.isNaN(delta) ? (
      <tspan fill={delta > 0 ? "#0F6E56" : delta < 0 ? "#CC0000" : "#9A9890"} fontSize={11}>
        {" "}
        {delta > 0 ? "▲" : delta < 0 ? "▼" : "→"}
        {Math.abs(Math.round(delta * 10) / 10)}
      </tspan>
    ) : null;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block", overflow: "visible" }}
      role="img"
      aria-label={label ? `${label}儀表` : "儀表"}
    >
      <g transform={`translate(${cx},${cy})`}>
        {/* 背景弧 */}
        <path d={bgPath} fill="#EEECE6" />
        {/* 值弧 */}
        {valuePath ? <path d={valuePath} fill={valueColor} /> : null}
      </g>

      {/* 中央大數字 */}
      <text
        x={cx}
        y={cy + 2}
        textAnchor="middle"
        fontSize={size * 0.24}
        fontWeight={700}
        fill={valueColor}
      >
        {hasValue ? Math.round(value as number) : "—"}
        {deltaNode}
      </text>

      {/* 標籤 */}
      {label ? (
        <text x={cx} y={cy + size * 0.2} textAnchor="middle" fontSize={10.5} fill="#9A9890">
          {label}
        </text>
      ) : null}
    </svg>
  );
}

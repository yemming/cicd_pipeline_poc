"use client";

import {
  Cell,
  Funnel,
  LabelList,
  FunnelChart as RFunnelChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  type ChartSize,
  type ChartTone,
  SERIES_COLORS,
  SIZE_HEIGHT,
  TONE_HEX,
  TOOLTIP_STYLE,
} from "./chart-tokens";

export interface FunnelDatum {
  name: string;
  value: number;
  /** 強制指定顏色，不填則照 tone palette 漸層 */
  fill?: string;
}

export interface FunnelChartProps {
  data: FunnelDatum[];
  tone?: ChartTone;
  size?: ChartSize;
  showTooltip?: boolean;
  /** 顯示階段名稱（左 label） */
  showLabels?: boolean;
  className?: string;
}

/**
 * FunnelChart — 銷售漏斗（來店 → 試駕 → 訂單 → 成交 → 交車）等多階段轉換用。
 * 同 tone 多階段：tone-700 → tone-500 → tone-100 三色循環，
 * 第 4 階以上再走 SERIES_COLORS 補色。
 */
export function FunnelChart({
  data,
  tone = "blue",
  size = "md",
  showTooltip = true,
  showLabels = true,
  className,
}: FunnelChartProps) {
  const palette = [TONE_HEX[tone][700], TONE_HEX[tone][500], TONE_HEX[tone][100]];

  return (
    <div className={className} style={{ width: "100%", height: SIZE_HEIGHT[size] }}>
      <ResponsiveContainer width="100%" height="100%">
        <RFunnelChart>
          {showTooltip ? <Tooltip contentStyle={TOOLTIP_STYLE} /> : null}
          <Funnel dataKey="value" data={data} isAnimationActive animationDuration={700}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.fill ?? (i < 3 ? palette[i] : SERIES_COLORS[(i - 3) % SERIES_COLORS.length])}
              />
            ))}
            {showLabels ? (
              <LabelList
                position="right"
                fill="#2C2C2A"
                stroke="none"
                dataKey="name"
                style={{ fontSize: 12, fontWeight: 500 }}
              />
            ) : null}
          </Funnel>
        </RFunnelChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart as RLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AXIS_STYLE,
  type ChartSize,
  type ChartTone,
  SERIES_COLORS,
  SIZE_HEIGHT,
  TONE_HEX,
  TOOLTIP_STYLE,
} from "./chart-tokens";

export interface LineChartSeries {
  /** dataKey in datum */
  key: string;
  /** legend / tooltip 顯示名（不填則用 key） */
  label?: string;
  /** 強制指定顏色（不填則照 tone palette 循環） */
  color?: string;
}

export interface LineChartProps<TDatum extends Record<string, unknown>> {
  data: TDatum[];
  /** x 軸對應的 datum key */
  xKey: string;
  /**
   * 要畫的 y series。傳單一字串 = 單線；傳陣列 = 多線。
   * 多線時第一條用 tone 主色，後續走 SERIES_COLORS 循環。
   */
  yKey: string | LineChartSeries[];
  tone?: ChartTone;
  size?: ChartSize;
  showLegend?: boolean;
  showTooltip?: boolean;
  /** 是否顯示資料點（dot），預設 true */
  showDots?: boolean;
  /** 平滑曲線（monotone）vs 直線（linear）；預設 monotone */
  smooth?: boolean;
  className?: string;
}

/**
 * LineChart — recharts wrapper，吃 design-tokens tone palette。
 *
 * 單線：
 *   <LineChart data={...} xKey="day" yKey="sales" tone="blue" />
 *
 * 多線：
 *   <LineChart data={...} xKey="day" yKey={[
 *     { key: "sales", label: "銷售" },
 *     { key: "target", label: "目標", color: "#9A9890" },
 *   ]} tone="teal" />
 */
export function LineChart<TDatum extends Record<string, unknown>>({
  data,
  xKey,
  yKey,
  tone = "blue",
  size = "md",
  showLegend = false,
  showTooltip = true,
  showDots = true,
  smooth = true,
  className,
}: LineChartProps<TDatum>) {
  const seriesList: LineChartSeries[] = Array.isArray(yKey)
    ? yKey
    : [{ key: yKey, label: yKey }];

  return (
    <div className={className} style={{ width: "100%", height: SIZE_HEIGHT[size] }}>
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEECE6" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={AXIS_STYLE}
            axisLine={{ stroke: "#EEECE6" }}
            tickLine={false}
          />
          <YAxis
            tick={AXIS_STYLE}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          {showTooltip ? <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "#D5D3CB", strokeDasharray: "3 3" }} /> : null}
          {showLegend ? <Legend wrapperStyle={{ fontSize: 11, color: "#5A5955" }} iconSize={10} /> : null}
          {seriesList.map((s, i) => {
            const color = s.color ?? (i === 0 ? TONE_HEX[tone][500] : SERIES_COLORS[i % SERIES_COLORS.length]);
            return (
              <Line
                key={s.key}
                type={smooth ? "monotone" : "linear"}
                dataKey={s.key}
                name={s.label ?? s.key}
                stroke={color}
                strokeWidth={2}
                dot={showDots ? { r: 3, fill: color, strokeWidth: 0 } : false}
                activeDot={{ r: 5, fill: "#fff", stroke: color, strokeWidth: 2 }}
                isAnimationActive={true}
                animationDuration={700}
              />
            );
          })}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}

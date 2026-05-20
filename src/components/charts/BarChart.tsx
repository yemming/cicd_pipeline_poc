"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  BarChart as RBarChart,
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

export interface BarChartSeries {
  key: string;
  label?: string;
  color?: string;
}

export interface BarChartProps<TDatum extends Record<string, unknown>> {
  data: TDatum[];
  /** 分類軸對應的 datum key（例：月份 / 部門 / 車型） */
  categoryKey: string;
  /**
   * 要畫的 value series。
   * - 字串 = 單條 bar
   * - 陣列 = 多條 grouped/stacked bar
   */
  valueKey: string | BarChartSeries[];
  tone?: ChartTone;
  size?: ChartSize;
  /** 排列方向：'vertical' = 直條（預設）；'horizontal' = 橫條 */
  orientation?: "vertical" | "horizontal";
  /** 堆疊 vs 分組（多 series 時生效） */
  stacked?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  /** 單 series 時，是否讓每個 bar 走 SERIES_COLORS 不同色（rainbow） */
  rainbow?: boolean;
  className?: string;
}

/**
 * BarChart — recharts wrapper。
 *
 * 單條：<BarChart data categoryKey="month" valueKey="sales" tone="blue" />
 * 橫條：orientation="horizontal"（部門排名榜單常用）
 * 多條：valueKey={[{ key: 'a' }, { key: 'b' }]} stacked
 */
export function BarChart<TDatum extends Record<string, unknown>>({
  data,
  categoryKey,
  valueKey,
  tone = "blue",
  size = "md",
  orientation = "vertical",
  stacked = false,
  showLegend = false,
  showTooltip = true,
  rainbow = false,
  className,
}: BarChartProps<TDatum>) {
  const seriesList: BarChartSeries[] = Array.isArray(valueKey)
    ? valueKey
    : [{ key: valueKey, label: valueKey }];

  const isHorizontal = orientation === "horizontal";

  return (
    <div className={className} style={{ width: "100%", height: SIZE_HEIGHT[size] }}>
      <ResponsiveContainer width="100%" height="100%">
        <RBarChart
          data={data}
          layout={isHorizontal ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 12, left: isHorizontal ? 24 : 0, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#EEECE6" vertical={isHorizontal} horizontal={!isHorizontal} />
          {isHorizontal ? (
            <>
              <XAxis type="number" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey={categoryKey}
                tick={AXIS_STYLE}
                axisLine={{ stroke: "#EEECE6" }}
                tickLine={false}
                width={72}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={categoryKey}
                tick={AXIS_STYLE}
                axisLine={{ stroke: "#EEECE6" }}
                tickLine={false}
              />
              <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={36} />
            </>
          )}
          {showTooltip ? <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(15,23,42,0.04)" }} /> : null}
          {showLegend ? <Legend wrapperStyle={{ fontSize: 11, color: "#5A5955" }} iconSize={10} /> : null}
          {seriesList.map((s, i) => {
            const baseColor = s.color ?? (i === 0 ? TONE_HEX[tone][500] : SERIES_COLORS[i % SERIES_COLORS.length]);
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label ?? s.key}
                fill={baseColor}
                radius={[4, 4, 0, 0]}
                stackId={stacked ? "stack" : undefined}
                isAnimationActive={true}
                animationDuration={700}
              >
                {seriesList.length === 1 && rainbow
                  ? data.map((_, idx) => (
                      <Cell key={idx} fill={SERIES_COLORS[idx % SERIES_COLORS.length]} />
                    ))
                  : null}
              </Bar>
            );
          })}
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}

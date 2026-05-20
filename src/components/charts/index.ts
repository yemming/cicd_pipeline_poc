/**
 * Charts barrel — 全站「華麗版」chart 元件統一 import 入口。
 *
 * 用法：
 *   import { LineChart, BarChart, DonutChart, GaugeChart,
 *            FunnelChart, HeatMap, SparkLine } from "@/components/charts";
 *
 * Tone palette / size / API 規格詳見各檔案 JSDoc 與
 * src/styles/design-tokens.css 的 `--tone-*` token。
 *
 * Sandbox：/admin/charts-sandbox
 */

export { LineChart, type LineChartProps, type LineChartSeries } from "./LineChart";
export { BarChart, type BarChartProps, type BarChartSeries } from "./BarChart";
export { DonutChart, type DonutChartProps, type DonutDatum } from "./DonutChart";
export { GaugeChart, type GaugeChartProps } from "./GaugeChart";
export { FunnelChart, type FunnelChartProps, type FunnelDatum } from "./FunnelChart";
export { HeatMap, type HeatMapProps, type HeatMapDatum } from "./HeatMapChart";
export { SparkLine, type SparkLineProps } from "./SparkLine";

export {
  type ChartTone,
  type ChartSize,
  TONE_HEX,
  SERIES_COLORS,
  TONE_CYCLE,
  SIZE_HEIGHT,
  heatmapColor,
} from "./chart-tokens";

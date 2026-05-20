/**
 * Shared chart tone helpers — 把 design-tokens.css 的 tone palette 包成
 * recharts / SVG 直接吃的 hex 字串。所有 chart 共用，不重複實作。
 */

export type ChartTone =
  | "blue"
  | "teal"
  | "amber"
  | "red"
  | "purple"
  | "green"
  | "gray";

export type ChartSize = "sm" | "md" | "lg";

/** 與 design-tokens.css `--tone-{tone}-{step}` 1:1 對映。 */
export const TONE_HEX: Record<ChartTone, { 50: string; 100: string; 500: string; 700: string; 900: string }> = {
  blue:   { 50: "#EFF6FF", 100: "#DBEAFE", 500: "#3B82F6", 700: "#1D4ED8", 900: "#1E3A8A" },
  teal:   { 50: "#ECFDF5", 100: "#D1FAE5", 500: "#14B8A6", 700: "#0F766E", 900: "#134E4A" },
  amber:  { 50: "#FFFBEB", 100: "#FEF3C7", 500: "#F59E0B", 700: "#B45309", 900: "#78350F" },
  red:    { 50: "#FEF2F2", 100: "#FEE2E2", 500: "#EF4444", 700: "#B91C1C", 900: "#7F1D1D" },
  purple: { 50: "#F5F3FF", 100: "#EDE9FE", 500: "#8B5CF6", 700: "#6D28D9", 900: "#4C1D95" },
  green:  { 50: "#F0FDF4", 100: "#DCFCE7", 500: "#22C55E", 700: "#15803D", 900: "#14532D" },
  gray:   { 50: "#F9FAFB", 100: "#F3F4F6", 500: "#6B7280", 700: "#374151", 900: "#111827" },
};

/** Multi-series chart 用的 tone 循環 palette（避免相鄰兩段同色）。 */
export const TONE_CYCLE: ChartTone[] = ["blue", "teal", "amber", "red", "purple", "green", "gray"];

/** 7 種 tone 各取 500 step 組成循環色盤，DonutChart / FunnelChart 多階段用。 */
export const SERIES_COLORS = TONE_CYCLE.map((t) => TONE_HEX[t][500]);

/** chart 容器高度（與 size prop 對映）。 */
export const SIZE_HEIGHT: Record<ChartSize, number> = {
  sm: 120,
  md: 240,
  lg: 360,
};

/**
 * HeatMap 色階：低 → 高 = tone-{tone}-100 → tone-{tone}-700。
 * 給定 0~1 的 t，回傳介於 100 與 700 之間的線性插值色（透過 SVG 用 stop 不夠彈性 → 直接 mix）。
 */
export function heatmapColor(tone: ChartTone, t: number): string {
  const clamp = Math.min(1, Math.max(0, t));
  const lo = hexToRgb(TONE_HEX[tone][100]);
  const hi = hexToRgb(TONE_HEX[tone][700]);
  const r = Math.round(lo.r + (hi.r - lo.r) * clamp);
  const g = Math.round(lo.g + (hi.g - lo.g) * clamp);
  const b = Math.round(lo.b + (hi.b - lo.b) * clamp);
  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** 共用 tooltip 樣式（recharts contentStyle）。 */
export const TOOLTIP_STYLE: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #EEECE6",
  borderRadius: 6,
  fontSize: 12,
  color: "#2C2C2A",
  boxShadow: "0 4px 6px -1px rgba(15,23,42,0.10), 0 2px 4px -2px rgba(15,23,42,0.06)",
  padding: "6px 10px",
};

export const AXIS_STYLE = {
  fontSize: 11,
  fill: "#9A9890",
} as const;

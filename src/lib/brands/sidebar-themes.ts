/**
 * Sidebar 佈景主題 — 9 套
 *
 * 第一套 midnight 是專案原黑色；剩下 8 套抄自 AG-Grid Theme Builder
 * (https://www.ag-grid.com/theme-builder/)，色票對應到 AG-Grid 的：
 *   - rail        ← Header Background Color（chrome 周邊）
 *   - panel       ← Background Color（grid 主底）
 *   - text        ← Foreground Color
 *   - textMuted   ← foreground 衍生 50% alpha
 *   - hover       ← Accent Color @ ~10% alpha
 *   - active      ← Accent Color @ ~18% alpha
 *   - divider     ← Border Color
 *
 * variant 給 component 判斷該用 dark or light fallback。
 */
export type SidebarTheme = {
  key: string;
  name: string;
  description: string;
  variant: "dark" | "light";
  rail: string;
  panel: string;
  text: string;
  textMuted: string;
  hover: string;
  active: string;
  divider: string;
};

export const SIDEBAR_THEMES: SidebarTheme[] = [
  // ── DealerOS 原預設 ───────────────────────────────────────
  {
    key: "midnight",
    name: "午夜黑",
    description: "DealerOS 預設深色（Ducati）",
    variant: "dark",
    rail: "#0F0F1F",
    panel: "#1A1A2E",
    text: "#FFFFFF",
    textMuted: "#9CA3AF",
    hover: "rgba(255,255,255,0.08)",
    active: "rgba(255,255,255,0.15)",
    divider: "rgba(255,255,255,0.08)",
  },
  // ── AG-Grid Theme Builder 8 套 ───────────────────────────
  {
    key: "quartz-light",
    name: "石英・晝",
    description: "AG-Grid Quartz Light — 乾淨潔白、商務現代感",
    variant: "light",
    rail: "#FBFBFB",
    panel: "#FFFFFF",
    text: "#181D1F",
    textMuted: "rgba(24,29,31,0.5)",
    hover: "rgba(33,150,243,0.10)",
    active: "rgba(33,150,243,0.16)",
    divider: "rgba(24,29,31,0.15)",
  },
  {
    key: "quartz-dark",
    name: "石英・夜",
    description: "AG-Grid Quartz Dark — 深藍灰、低眩光辦公室",
    variant: "dark",
    rail: "#2E3744",
    panel: "#1F2836",
    text: "#FFFFFF",
    textMuted: "rgba(255,255,255,0.5)",
    hover: "rgba(33,150,243,0.10)",
    active: "rgba(33,150,243,0.20)",
    divider: "rgba(255,255,255,0.15)",
  },
  {
    key: "terminal",
    name: "駭客終端機",
    description: "AG-Grid 螢光綠 + 黃選取 — 工程師最愛的 mono 終端風",
    variant: "dark",
    rail: "#21222C",
    panel: "#15161E",
    text: "#68FF8E",
    textMuted: "rgba(104,255,142,0.55)",
    hover: "rgba(104,255,142,0.10)",
    active: "rgba(104,255,142,0.20)",
    divider: "rgba(104,255,142,0.22)",
  },
  {
    key: "frost",
    name: "純白霜",
    description: "AG-Grid Inter / Balham — 全白底配淺灰邊，極簡商務",
    variant: "light",
    rail: "#F8FAFC",
    panel: "#FFFFFF",
    text: "#555B62",
    textMuted: "#84868B",
    hover: "rgba(8,122,209,0.08)",
    active: "rgba(8,122,209,0.16)",
    divider: "#D7E2E6",
  },
  {
    key: "material-dark",
    name: "質感深夜",
    description: "AG-Grid Material Dark — Roboto、接近全黑底",
    variant: "dark",
    rail: "#0C0C0D",
    panel: "#1B1B1D",
    text: "#FFFFFF",
    textMuted: "rgba(255,255,255,0.6)",
    hover: "rgba(33,150,243,0.10)",
    active: "rgba(33,150,243,0.20)",
    divider: "rgba(255,255,255,0.10)",
  },
  {
    key: "alpine-light",
    name: "阿爾卑斯・晨",
    description: "AG-Grid Alpine Light — Arial 字體、淺灰邊極淡",
    variant: "light",
    rail: "#F9FAFB",
    panel: "#FFFFFF",
    text: "#2E3742",
    textMuted: "#919191",
    hover: "rgba(33,150,243,0.08)",
    active: "rgba(33,150,243,0.16)",
    divider: "rgba(46,55,66,0.15)",
  },
  {
    key: "antique",
    name: "古典紙本",
    description: "AG-Grid Merriweather / UnifrakturCook — 米黃紙本 × 深褐字",
    variant: "light",
    rail: "#FAD0A3",
    panel: "#FFDEB4",
    text: "#593F2B",
    textMuted: "rgba(89,63,43,0.65)",
    hover: "rgba(6,77,185,0.08)",
    active: "rgba(6,77,185,0.16)",
    divider: "#E9CBA4",
  },
  {
    key: "pixel",
    name: "像素懷舊",
    description: "AG-Grid Pixelify Sans — 沙色底像素風",
    variant: "light",
    rail: "#E4DAD1",
    panel: "#F1EDE1",
    text: "#3C3A35",
    textMuted: "#605E57",
    hover: "rgba(0,134,244,0.10)",
    active: "rgba(0,134,244,0.18)",
    divider: "#98968F",
  },
];

export const DEFAULT_SIDEBAR_THEME_KEY = "midnight";

export function getSidebarTheme(key: string | null | undefined): SidebarTheme {
  if (!key) return SIDEBAR_THEMES[0];
  return SIDEBAR_THEMES.find((t) => t.key === key) ?? SIDEBAR_THEMES[0];
}

/** 把 theme 轉成可以直接塞到 inline style 的 CSS var dict。 */
export function themeToCssVars(theme: SidebarTheme): Record<string, string> {
  return {
    "--sidebar-rail-bg": theme.rail,
    "--sidebar-panel-bg": theme.panel,
    "--sidebar-text": theme.text,
    "--sidebar-text-muted": theme.textMuted,
    "--sidebar-hover": theme.hover,
    "--sidebar-active": theme.active,
    "--sidebar-divider": theme.divider,
  };
}

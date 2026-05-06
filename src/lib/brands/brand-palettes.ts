/**
 * Brand 主顏色色票 — 8 套 preset + 自訂
 *
 * 每套兩個 hex：
 *   - primary：主色（按鈕、品牌 chip、active state、focus ring）
 *   - accent：對比強調（dashboard 金線、徽章）
 * primaryDark 由 primary 自動推算（HSL lightness − 12%）。
 *
 * 客戶選 'custom' 時，從 brand_appearance.custom_palette jsonb 讀使用者填的兩個 hex。
 */

export type BrandPalette = {
  key: string;
  name: string;
  description: string;
  primary: string;
  accent: string;
};

export const BRAND_PALETTES: BrandPalette[] = [
  {
    key: "ducati-red",
    name: "杜卡迪赤焰",
    description: "經典紅 × 深夜藍 — 義大利重機標準視覺",
    primary: "#CC0000",
    accent: "#1A1A2E",
  },
  {
    key: "indian-bronze",
    name: "印第安青銅紅",
    description: "暗紅 × 古銅金 — 美式重機紳士風",
    primary: "#B6181B",
    accent: "#C9A84C",
  },
  {
    key: "royal-azure",
    name: "皇家蔚藍",
    description: "深藍 × 純白 — 海軍質感、跨歐系車",
    primary: "#002C9B",
    accent: "#FFFFFF",
  },
  {
    key: "lime-flash",
    name: "萊姆閃電綠",
    description: "鮮綠 × 純黑 — 速度感、街頭風",
    primary: "#18A52D",
    accent: "#1A1A1A",
  },
  {
    key: "inferno-orange",
    name: "烈焰橙",
    description: "橘紅 × 純黑 — 機能風、戶外越野",
    primary: "#FF6600",
    accent: "#1A1A1A",
  },
  {
    key: "sky-marine",
    name: "海天藍",
    description: "天藍 × 純白 — 簡潔、SaaS 商務",
    primary: "#009ADA",
    accent: "#FFFFFF",
  },
  {
    key: "platinum-gold",
    name: "鉑金灰",
    description: "鋼灰 × 香檳金 — 精品、高端",
    primary: "#3F4853",
    accent: "#D4AF37",
  },
  {
    key: "forest-cream",
    name: "森林墨綠",
    description: "墨綠 × 米色 — 復古、品味、英倫",
    primary: "#1B5E20",
    accent: "#F5F0E1",
  },
];

export const DEFAULT_BRAND_PALETTE_KEY = "ducati-red";

export type ResolvedBrandColors = {
  primary: string;
  primaryDark: string;
  accent: string;
};

/**
 * 解析 palette key（含 'custom'）→ 三個 hex。
 * - preset：查表
 * - custom：用 customOverride（{primary, accent}），不合法 fallback default
 * - 找不到 key：fallback default
 */
export function resolveBrandColors(
  paletteKey: string | null | undefined,
  customOverride?: { primary?: string; accent?: string } | null,
): ResolvedBrandColors {
  if (paletteKey === "custom" && customOverride) {
    const primary = isValidHex(customOverride.primary) ? customOverride.primary! : "#CC0000";
    const accent = isValidHex(customOverride.accent) ? customOverride.accent! : "#1A1A2E";
    return {
      primary,
      primaryDark: darken(primary, 0.12),
      accent,
    };
  }

  const preset =
    BRAND_PALETTES.find((p) => p.key === paletteKey) ??
    BRAND_PALETTES.find((p) => p.key === DEFAULT_BRAND_PALETTE_KEY)!;
  return {
    primary: preset.primary,
    primaryDark: darken(preset.primary, 0.12),
    accent: preset.accent,
  };
}

export function paletteCssVars(colors: ResolvedBrandColors): Record<string, string> {
  return {
    "--color-brand-primary": colors.primary,
    "--color-brand-primary-dark": colors.primaryDark,
    "--color-brand-accent": colors.accent,
  };
}

// ──────────────────────────────────────────────────────────
// 色彩工具
// ──────────────────────────────────────────────────────────

export function isValidHex(s: string | undefined | null): s is string {
  return typeof s === "string" && /^#[0-9A-Fa-f]{6}$/.test(s);
}

/**
 * Darken a hex by `amount` (0–1) in HSL lightness space.
 * 例：darken('#CC0000', 0.12) → 約 #A30000
 */
export function darken(hex: string, amount: number): string {
  if (!isValidHex(hex)) return hex;
  const { h, s, l } = hexToHsl(hex);
  const l2 = Math.max(0, Math.min(1, l - amount));
  return hslToHex(h, s, l2);
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hueToRgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

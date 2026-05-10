import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";
import { DEFAULT_SIDEBAR_THEME_KEY } from "./sidebar-themes";
import { DEFAULT_BRAND_PALETTE_KEY, isValidHex } from "./brand-palettes";
import { DEFAULT_SHELL_LAYOUT_KEY, type ShellLayoutKey } from "./shell-layouts";
import { getCurrentBrand } from "./current";

export type BrandAppearance = {
  brand_id: string;
  dashboard_tagline: string;
  footer_badge_url: string | null;
  footer_badge_path: string | null;
  sidebar_theme: string;
  brand_palette: string;
  custom_palette: { primary?: string; accent?: string } | null;
  shell_layout: ShellLayoutKey;
  shell_options: Record<string, unknown>;
  updated_at: string | null;
};

/**
 * 載入 brand_appearance，找不到則 fallback 預設值（避免後台還沒設過時前台 crash）。
 * React.cache 同 request 內共用。
 */
export const loadBrandAppearance = cache(async (brandKey: string): Promise<BrandAppearance> => {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("brand_appearance")
    .select(
      "brand_id, dashboard_tagline, footer_badge_url, footer_badge_path, sidebar_theme, brand_palette, custom_palette, shell_layout, shell_options, updated_at",
    )
    .eq("brand_id", brandKey)
    .maybeSingle();

  if (data) {
    return {
      brand_id: data.brand_id,
      dashboard_tagline: (data.dashboard_tagline ?? "").trim() || defaultTagline(),
      footer_badge_url: data.footer_badge_url ?? null,
      footer_badge_path: data.footer_badge_path ?? null,
      sidebar_theme: data.sidebar_theme || DEFAULT_SIDEBAR_THEME_KEY,
      brand_palette: data.brand_palette || DEFAULT_BRAND_PALETTE_KEY,
      custom_palette: sanitizeCustomPalette(data.custom_palette),
      shell_layout: sanitizeShellLayout(data.shell_layout),
      shell_options: sanitizeShellOptions(data.shell_options),
      updated_at: data.updated_at,
    };
  }

  return {
    brand_id: brandKey,
    dashboard_tagline: defaultTagline(),
    footer_badge_url: null,
    footer_badge_path: null,
    sidebar_theme: DEFAULT_SIDEBAR_THEME_KEY,
    brand_palette: DEFAULT_BRAND_PALETTE_KEY,
    custom_palette: null,
    shell_layout: DEFAULT_SHELL_LAYOUT_KEY,
    shell_options: {},
    updated_at: null,
  };
});

function defaultTagline(): string {
  const brand = getCurrentBrand();
  return `${brand.displayName.toUpperCase()} OFFICIAL DEALER`;
}

function sanitizeCustomPalette(raw: unknown): { primary?: string; accent?: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const out: { primary?: string; accent?: string } = {};
  if (typeof obj.primary === "string" && isValidHex(obj.primary)) out.primary = obj.primary;
  if (typeof obj.accent === "string" && isValidHex(obj.accent)) out.accent = obj.accent;
  return out.primary || out.accent ? out : null;
}

function sanitizeShellLayout(_raw: unknown): ShellLayoutKey {
  // 全站收斂為單一 shell — 不論 DB 紀錄什麼舊值一律回 default
  return DEFAULT_SHELL_LAYOUT_KEY;
}

function sanitizeShellOptions(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────
// 個人 override（user 等級）
// ──────────────────────────────────────────────────────────

export type UserAppearanceOverride = {
  preferred_palette_key: string | null;
  preferred_custom_palette: { primary?: string; accent?: string } | null;
  preferred_sidebar_theme_key: string | null;
};

export const loadUserAppearanceOverride = cache(
  async (userId: string): Promise<UserAppearanceOverride | null> => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("profiles")
      .select(
        "preferred_palette_key, preferred_custom_palette, preferred_sidebar_theme_key",
      )
      .eq("id", userId)
      .maybeSingle();
    if (!data) return null;
    return {
      preferred_palette_key: data.preferred_palette_key ?? null,
      preferred_custom_palette: sanitizeCustomPalette(
        data.preferred_custom_palette,
      ),
      preferred_sidebar_theme_key: data.preferred_sidebar_theme_key ?? null,
    };
  },
);

/**
 * 把 brand 預設與個人 override merge — user 設過的就用 user 的，否則 fallback brand。
 * custom_palette 的來源跟著最終 palette_key 走（誰提供 custom 就用誰的 hex）。
 */
export function mergeUserAppearance(
  brand: BrandAppearance,
  user: UserAppearanceOverride | null,
): BrandAppearance {
  if (!user) return brand;

  const sidebar_theme =
    user.preferred_sidebar_theme_key ?? brand.sidebar_theme;
  const brand_palette = user.preferred_palette_key ?? brand.brand_palette;

  let custom_palette: { primary?: string; accent?: string } | null = null;
  if (brand_palette === "custom") {
    custom_palette =
      user.preferred_palette_key === "custom"
        ? user.preferred_custom_palette
        : brand.custom_palette;
  }

  return { ...brand, sidebar_theme, brand_palette, custom_palette };
}

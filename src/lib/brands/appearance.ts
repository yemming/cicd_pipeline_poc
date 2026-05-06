import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";
import { DEFAULT_SIDEBAR_THEME_KEY } from "./sidebar-themes";
import { DEFAULT_BRAND_PALETTE_KEY, isValidHex } from "./brand-palettes";
import { getCurrentBrand } from "./current";

export type BrandAppearance = {
  brand_id: string;
  dashboard_tagline: string;
  footer_badge_url: string | null;
  footer_badge_path: string | null;
  sidebar_theme: string;
  brand_palette: string;
  custom_palette: { primary?: string; accent?: string } | null;
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
      "brand_id, dashboard_tagline, footer_badge_url, footer_badge_path, sidebar_theme, brand_palette, custom_palette, updated_at",
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

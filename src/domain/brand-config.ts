import "server-only";

/**
 * Domain Helper — Brand Config（品牌專屬設定）
 *
 * DealerOS 是多品牌平台（碩文=ducati / 海德生=indian）。早期多處 UI 把 DUCATI 專屬
 * 內容寫死（Desmo 保養、YouTech 保固系統…），Indian 員工會看到無關功能造成誤會。
 * 本表 + helper 把這些品牌差異收斂成「依品牌設定條件顯示」的單一事實來源。
 *
 * 讀寫一律走本 helper，UI 禁止直連 supabase（專案天條）。
 *
 * 對應表：brand_config（brand_id PRIMARY KEY，對齊 nav_nodes 的小寫慣例）。
 * 設定點（B-3）：
 *   - has_desmo        → Desmo 保養選項 / Desmo 工時費率列 是否顯示
 *   - warranty_system  → 保固系統（'YouTech' | 'Polaris'）；YouTech 編號欄位才顯示
 *   - oil_interval_km  → 機油更換里程建議
 *   - warranty_reg_days→ 保固登錄期限
 *   - service_template → 保養套餐模板（'desmo' | 'standard'）
 */

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type WarrantySystem = "YouTech" | "Polaris" | null;
export type ServiceTemplate = "desmo" | "standard";

export type BrandConfig = {
  brandId: string;
  brandName: string | null;
  hasDesmo: boolean;
  warrantySystem: WarrantySystem;
  oilIntervalKm: number | null;
  warrantyRegDays: number | null;
  serviceTemplate: ServiceTemplate;
  metadata: Record<string, unknown>;
};

type BrandConfigRow = {
  brand_id: string;
  brand_name: string | null;
  has_desmo: boolean | null;
  warranty_system: string | null;
  oil_interval_km: number | null;
  warranty_reg_days: number | null;
  service_template: string | null;
  metadata: Record<string, unknown> | null;
};

/** 查無設定時的安全 fallback：standard 模板、無 Desmo、無保固系統。 */
function fallbackConfig(brandId: string): BrandConfig {
  return {
    brandId,
    brandName: null,
    hasDesmo: false,
    warrantySystem: null,
    oilIntervalKm: null,
    warrantyRegDays: null,
    serviceTemplate: "standard",
    metadata: {},
  };
}

function rowToConfig(r: BrandConfigRow): BrandConfig {
  return {
    brandId: r.brand_id,
    brandName: r.brand_name,
    hasDesmo: r.has_desmo ?? false,
    warrantySystem: (r.warranty_system as WarrantySystem) ?? null,
    oilIntervalKm: r.oil_interval_km,
    warrantyRegDays: r.warranty_reg_days,
    serviceTemplate: (r.service_template as ServiceTemplate) ?? "standard",
    metadata: r.metadata ?? {},
  };
}

/**
 * 取某品牌的設定（typed）。查無 → 回 fallback（standard、無 Desmo），不 throw，
 * 讓新品牌在還沒 seed brand_config 前頁面仍能正常顯示（只是看不到品牌專屬功能）。
 */
export const getBrandConfig = cache(async (brandId: string): Promise<BrandConfig> => {
  const client = await createClient();
  const { data } = await client
    .from("brand_config")
    .select(
      "brand_id, brand_name, has_desmo, warranty_system, oil_interval_km, warranty_reg_days, service_template, metadata",
    )
    .eq("brand_id", brandId)
    .maybeSingle();
  return data ? rowToConfig(data as BrandConfigRow) : fallbackConfig(brandId);
});

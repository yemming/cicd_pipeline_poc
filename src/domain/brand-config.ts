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
  /**
   * 組織模式（per-brand，B 海德生回覆問題二）：3=三層（集團→法人→門店）/ 4=四層（集團→法人→區域→門店）。
   * 落點 metadata.org_mode（jsonb，可隨時 promote 成 typed column）。查無 → 預設 4（支援最大層級）。
   */
  orgMode: 3 | 4;
  metadata: Record<string, unknown>;
};

/** 從 brand_config.metadata.org_mode 解析組織模式，非 3 一律視為 4（最大層級安全預設）。 */
export function resolveOrgMode(metadata: Record<string, unknown> | null | undefined): 3 | 4 {
  return Number(metadata?.org_mode) === 3 ? 3 : 4;
}

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
    orgMode: 4,
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
    orgMode: resolveOrgMode(r.metadata),
    metadata: r.metadata ?? {},
  };
}

/**
 * 取某品牌的設定（typed）。查無 → 回 fallback（standard、無 Desmo），不 throw，
 * 讓新品牌在還沒 seed brand_config 前頁面仍能正常顯示（只是看不到品牌專屬功能）。
 */
/** 保固頁顯示用內容（品牌中性化）——避免把 DUCATI 專屬條款露給其他品牌。 */
export type WarrantyTerm = { label: string; value: string; sub: string };
export type WarrantyContent = {
  title: string;
  terms: WarrantyTerm[];
  exclusions: string[];
};

/**
 * 解析某品牌的保固條款顯示內容。
 *   - brand_config.metadata.warranty 有設定 → 用該品牌專屬內容（ducati 走這條，內容與舊版完全一致）。
 *   - 沒設定 → 用品牌中性 fallback（依 brandName / hasDesmo 動態組，絕不露 DUCATI / 碩文 / Desmo 字樣）。
 * 這樣 indian 等未 seed warranty metadata 的品牌一律拿到中性版，徹底解決 B-13 / C-30 寫死 Ducati 的破口。
 */
export function resolveWarrantyContent(config: BrandConfig): WarrantyContent {
  const meta = config.metadata?.warranty as Partial<WarrantyContent> | undefined;
  if (meta && Array.isArray(meta.terms) && meta.terms.length > 0) {
    return {
      title: meta.title ?? `${config.brandName ?? "原廠"} 保固條款 Warranty Terms`,
      terms: meta.terms,
      exclusions: Array.isArray(meta.exclusions) ? meta.exclusions : [],
    };
  }

  // ── 中性 fallback（無品牌專屬 metadata 時）──
  const brandName = config.brandName ?? "原廠";
  const terms: WarrantyTerm[] = [
    { label: "整車保固", value: "2 年不限里程", sub: "自保固啟動日起" },
    { label: "零件保固（原廠非消耗品）", value: "24 個月", sub: "授權經銷商購買安裝起算" },
  ];
  if (config.hasDesmo) {
    terms.push({ label: "Desmo 服務（≥500cc）", value: "24 個月 或 40,000 km", sub: "以先到為準" });
  }
  const exclusions = [
    "用於任何運動競賽的機車",
    "用於租賃服務的機車",
    `正常使用自然耗損零件（輪胎、傳動零件、${config.hasDesmo ? "正時皮帶、" : ""}煞車、離合器等）`,
    "因氧化、環境因素、非正常使用、未定期保養所導致的故障與瑕疵",
    "在非原廠官方授權經銷商進行的維修保養",
    "使用未經原廠核准之零件或改裝部品",
    "未遵守車主手冊使用建議，或未參加召回活動",
  ];
  return { title: `${brandName} 保固條款 Warranty Terms`, terms, exclusions };
}

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

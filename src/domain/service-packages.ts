import "server-only";

/**
 * Domain Helper — Service Packages（服務套餐主檔 + 工時費率）
 *
 * G4（集團 Phase 2，2026-06-01）新增。售後 04B 快速報價 / 07B 套餐費率設定 / 集團 GRP14 定價同步
 * 三方共用的基礎主檔。資料落點：typed core 表 service_packages / labor_rates（非 business_rules，
 * 因為這是會被多頁讀、會被定價同步寫、形狀穩定的主檔，符合天條「形狀穩 → typed column」）。
 *
 * 讀寫一律走本 helper，UI 禁止直連 supabase。
 */

import { createClient } from "@/lib/supabase/server";

export type ServicePackageItem = {
  kind: "labor" | "part";
  sku?: string;
  name: string;
  qty?: number;
  lu?: number;
  price?: number;
};

export type ServicePackage = {
  id: string;
  brandId: string;
  code: string;
  name: string;
  pkgType: "standard" | "store_custom" | "promo";
  mileageInterval: number | null;
  items: ServicePackageItem[];
  listPrice: number | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  pricingPolicyId: string | null;
};

export type LaborRate = {
  id: string;
  brandId: string;
  bizType: string; // MN|RP|WC|AC|PD|Desmo
  ratePerLu: number;
  isActive: boolean;
};

type SpRow = {
  id: string;
  brand_id: string;
  code: string;
  name: string;
  pkg_type: string;
  mileage_interval: number | null;
  items: ServicePackageItem[] | null;
  list_price: number | null;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  pricing_policy_id: string | null;
};

function rowToPackage(r: SpRow): ServicePackage {
  return {
    id: r.id,
    brandId: r.brand_id,
    code: r.code,
    name: r.name,
    pkgType: (r.pkg_type as ServicePackage["pkgType"]) ?? "standard",
    mileageInterval: r.mileage_interval,
    items: r.items ?? [],
    listPrice: r.list_price,
    validFrom: r.valid_from,
    validTo: r.valid_to,
    isActive: r.is_active,
    pricingPolicyId: r.pricing_policy_id,
  };
}

/**
 * 撈某 brand 的服務套餐。預設只回 is_active 且在有效期內（04B 查詢頁用 — 停用/過期套餐不顯示）。
 * 傳 { includeInactive:true } 給 07B 後台管理頁看全部。
 */
export async function listServicePackages(
  brandId: string,
  opts: { includeInactive?: boolean; mileage?: number } = {},
): Promise<ServicePackage[]> {
  const client = await createClient();
  let q = client
    .from("service_packages")
    .select("id, brand_id, code, name, pkg_type, mileage_interval, items, list_price, valid_from, valid_to, is_active, pricing_policy_id")
    .eq("brand_id", brandId)
    .order("mileage_interval", { ascending: true, nullsFirst: false });
  if (!opts.includeInactive) q = q.eq("is_active", true);
  const { data } = await q;
  let rows = ((data ?? []) as SpRow[]).map(rowToPackage);
  if (!opts.includeInactive) {
    const today = todayISO();
    rows = rows.filter(
      (p) => (!p.validFrom || p.validFrom <= today) && (!p.validTo || p.validTo >= today),
    );
  }
  // 04B：依里程自動建議對應套餐（最接近且 <= 里程的標準套餐）
  if (typeof opts.mileage === "number") {
    rows = rows.filter((p) => p.mileageInterval == null || p.mileageInterval <= opts.mileage!);
  }
  return rows;
}

/** 撈某 brand 的工時費率表（07B/04B 工資計算用）。 */
export async function listLaborRates(brandId: string): Promise<LaborRate[]> {
  const client = await createClient();
  const { data } = await client
    .from("labor_rates")
    .select("id, brand_id, biz_type, rate_per_lu, is_active")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("biz_type", { ascending: true });
  return ((data ?? []) as Array<{ id: string; brand_id: string; biz_type: string; rate_per_lu: number; is_active: boolean }>).map(
    (r) => ({ id: r.id, brandId: r.brand_id, bizType: r.biz_type, ratePerLu: Number(r.rate_per_lu), isActive: r.is_active }),
  );
}

/** 確定性今日（Asia/Taipei），不依環境 locale。 */
function todayISO(): string {
  const t = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

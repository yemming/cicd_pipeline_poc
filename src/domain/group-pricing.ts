import "server-only";

/**
 * Domain Helper — Group Pricing（集團管理 · 定價折扣設定 GRP14）
 *
 * 第二十輪 商務管理層。集團總部對每個品項/車型設「建議售價 + 折扣授權上下限」，
 * 門店成交低於下限觸發越界警示。這是集團對門店的定價治理工具。
 *
 * ── 資料落點（round-20 Q1 拍板：走 business_rules，符合天條「規則類一張打天下」）──
 *   business_rules（rule_kind='pricing_policy'、brand_id=indian）：
 *     config jsonb = { kind('vehicle'|'parts'|'accessory'), ref_id, name, code?, series?,
 *       msrp, cost, disc_min, disc_max, status('draft'|'review'|'active'),
 *       effective_date, audit_log:[{by,at,field,old,new}] }
 *   business_rules（rule_kind='pricing_deviation'）：config.rows[] = 門店成交偏差 demo。
 *
 * ── 為什麼 reads 走 createClient、writes 走 service client ──
 *   讀：RLS user_has_brand 已能 scope；寫：business_rules 可能無 user INSERT/UPDATE policy，
 *   且本功能 admin-gated（page + action 都檢 isAdmin），用 service client 寫 + 顯式 brand_id
 *   是既有 admin server action 慣例。
 *
 * 紀律：server-only domain helper，內部自己 import supabase（天條只禁 UI 直連）。
 */

import { createClient } from "@/lib/supabase/server";

/** 定價政策品項分類。 */
export type PricingKind = "vehicle" | "parts" | "accessory";

/** 定價政策審核狀態。 */
export type PricingStatus = "draft" | "review" | "active";

/** 稽核 log 一筆。 */
export type PricingAuditEntry = {
  by: string;
  at: string;
  field: string;
  old: string;
  new: string;
};

/** 一筆定價政策（business_rules.config 攤平 + id）。 */
export type PricingPolicy = {
  id: string;
  kind: PricingKind;
  refId: string | null;
  name: string;
  code: string | null;
  series: string | null;
  msrp: number | null;
  cost: number | null;
  /** 標準毛利率 0..1（(msrp-cost)/msrp；缺料回 null） */
  marginRate: number | null;
  discMin: number | null;
  discMax: number | null;
  /** 最低售價 = msrp × discMin/100 */
  minPrice: number | null;
  status: PricingStatus;
  effectiveDate: string | null;
  auditLog: PricingAuditEntry[];
  /** G4：核准生效後要同步定價的下游 service_packages.code 清單。 */
  targetPackageCodes: string[];
  sortOrder: number | null;
};

/** 門店成交偏差一列。 */
export type PricingDeviationRow = {
  store: string;
  item: string;
  msrp: number | null;
  deal: number | null;
  dev: number | null; // 偏差率 %（正=高於建議、負=低於）
  status: "ok" | "bad";
};

/** GRP14 概況 KPI。 */
export type PricingOverview = {
  totalCount: number;
  vehicleCount: number;
  partsCount: number;
  accessoryCount: number;
  /** 建議售價達成率（偏差落在授權內佔比 0..1） */
  achievementRate: number | null;
  /** 偏差警示門店數 */
  deviationStoreCount: number;
  /** 待審項目數（status='review'） */
  pendingCount: number;
};

type RawConfig = {
  kind?: PricingKind;
  ref_id?: string;
  name?: string;
  code?: string;
  series?: string;
  msrp?: number;
  cost?: number;
  disc_min?: number;
  disc_max?: number;
  status?: PricingStatus;
  effective_date?: string;
  audit_log?: PricingAuditEntry[];
  target_package_codes?: string[] | null;
};

/** business_rules row → PricingPolicy（攤平 config + 算衍生欄）。 */
function rowToPolicy(row: { id: string; config: RawConfig | null; sort_order: number | null }): PricingPolicy {
  const c = row.config ?? {};
  const msrp = c.msrp ?? null;
  const cost = c.cost ?? null;
  const discMin = c.disc_min ?? null;
  const marginRate = msrp != null && msrp > 0 && cost != null ? (msrp - cost) / msrp : null;
  const minPrice = msrp != null && discMin != null ? Math.round((msrp * discMin) / 100) : null;
  return {
    id: row.id,
    kind: c.kind ?? "parts",
    refId: c.ref_id ?? null,
    name: c.name ?? "(未命名)",
    code: c.code ?? null,
    series: c.series ?? null,
    msrp,
    cost,
    marginRate,
    discMin,
    discMax: c.disc_max ?? null,
    minPrice,
    status: c.status ?? "draft",
    effectiveDate: c.effective_date ?? null,
    auditLog: c.audit_log ?? [],
    targetPackageCodes: (c.target_package_codes ?? []).filter(Boolean),
    sortOrder: row.sort_order,
  };
}

/** 撈某 brand 全部定價政策（依 sort_order）。 */
export async function listPricingPolicies(brandId: string): Promise<PricingPolicy[]> {
  const client = await createClient();
  const { data } = await client
    .from("business_rules")
    .select("id, config, sort_order")
    .eq("brand_id", brandId)
    .eq("rule_kind", "pricing_policy")
    .order("sort_order", { ascending: true });
  return ((data ?? []) as Array<{ id: string; config: RawConfig | null; sort_order: number | null }>).map(rowToPolicy);
}

/** 撈單筆定價政策（找不到回 null）。 */
export async function getPricingPolicy(brandId: string, id: string): Promise<PricingPolicy | null> {
  const client = await createClient();
  const { data } = await client
    .from("business_rules")
    .select("id, config, sort_order")
    .eq("brand_id", brandId)
    .eq("rule_kind", "pricing_policy")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return rowToPolicy(data as { id: string; config: RawConfig | null; sort_order: number | null });
}

/** 政策摘要（07B 徽章用：把套餐的 pricing_policy_id 解成可讀名稱/狀態）。 */
export type PricingPolicySummary = { id: string; name: string; status: PricingStatus };

/**
 * 撈某 brand 全部定價政策的 id → { name, status } map（07B 服務套餐徽章解析用）。
 * 只取輕量欄位，不算衍生欄。
 */
export async function getPricingPolicyNameMap(
  brandId: string,
): Promise<Record<string, PricingPolicySummary>> {
  const client = await createClient();
  const { data } = await client
    .from("business_rules")
    .select("id, config")
    .eq("brand_id", brandId)
    .eq("rule_kind", "pricing_policy");
  const map: Record<string, PricingPolicySummary> = {};
  for (const row of (data ?? []) as Array<{ id: string; config: RawConfig | null }>) {
    const c = row.config ?? {};
    map[row.id] = { id: row.id, name: c.name ?? "(未命名)", status: c.status ?? "draft" };
  }
  return map;
}

/** 撈門店成交偏差（pricing_deviation 單列 config.rows[]）。 */
export async function listPricingDeviations(brandId: string): Promise<PricingDeviationRow[]> {
  const client = await createClient();
  const { data } = await client
    .from("business_rules")
    .select("config")
    .eq("brand_id", brandId)
    .eq("rule_kind", "pricing_deviation")
    .order("sort_order", { ascending: true })
    .limit(1);
  const row = (data ?? [])[0] as { config: { rows?: PricingDeviationRow[] } | null } | undefined;
  return row?.config?.rows ?? [];
}

/** 概況 KPI（由政策清單 + 偏差規則衍生）。 */
export async function getPricingOverview(brandId: string): Promise<PricingOverview> {
  const [policies, deviations] = await Promise.all([
    listPricingPolicies(brandId),
    listPricingDeviations(brandId),
  ]);
  const vehicleCount = policies.filter((p) => p.kind === "vehicle").length;
  const partsCount = policies.filter((p) => p.kind === "parts").length;
  const accessoryCount = policies.filter((p) => p.kind === "accessory").length;
  const pendingCount = policies.filter((p) => p.status === "review").length;
  const badDev = deviations.filter((d) => d.status === "bad");
  const deviationStoreCount = new Set(badDev.map((d) => d.store)).size;
  const achievementRate =
    deviations.length > 0 ? (deviations.length - badDev.length) / deviations.length : null;
  return {
    totalCount: policies.length,
    vehicleCount,
    partsCount,
    accessoryCount,
    achievementRate,
    deviationStoreCount,
    pendingCount,
  };
}

"use server";

/**
 * Domain Helper — Sales KPI Targets + HABC Thresholds（RS_M3 主管設定 Tab 0）
 *
 * 涵蓋兩類業務規則（都掛在 business_rules 表）：
 *   - business_rules.sales_kpi_target（Layer 1 結果指標 × 3 + Layer 2 過程指標 × 6 = 9 筆）
 *   - business_rules.habc_threshold（HABC H/A/B/C 四級天數閾值 = 4 筆）
 *
 * 後續串接：
 *   - /sales/funnel 紅 / 黃 / 綠閾值讀 sales_kpi_target.value
 *   - RS_M1 漏斗看板 HABC 自動建議讀 habc_threshold.value
 *
 * 提案：docs/proposals/feature-rs-m3-kpi-targets-phase1.md
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { SalesKpiTargetKey, HabcThresholdKey } from "./sales-kpi-targets.constants";

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type KpiTargetConfig = {
  key: SalesKpiTargetKey;
  layer: 1 | 2;
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  default_value: number;
  description: string;
  icon?: string;
};

export type KpiTargetRow = {
  id: string;
  config: KpiTargetConfig;
  sort_order: number;
};

export type HabcThresholdConfig = {
  key: HabcThresholdKey;
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  default_value: number;
  description: string;
};

export type HabcThresholdRow = {
  id: string;
  config: HabcThresholdConfig;
  sort_order: number;
};

const REVALIDATE_PATH = "/sales/manager/kpi-targets";
function revalidateAll() {
  revalidatePath(REVALIDATE_PATH);
}

function mapDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23505") return "代碼重複：此項目已存在";
  if (error.code === "23503") return "參照的關聯不存在";
  if (error.code === "23514") return `欄位驗證失敗：${error.message}`;
  return `${fallback}：${error.message}`;
}

// ──────────────────────────────────────────────────────────────────────────
// KPI Targets (Layer 1 + Layer 2)
// ──────────────────────────────────────────────────────────────────────────

export async function listSalesKpiTargets(): Promise<KpiTargetRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("business_rules")
    .select("id, config, sort_order")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "sales_kpi_target")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    sort_order: r.sort_order,
    config: r.config as KpiTargetConfig,
  }));
}

export async function updateSalesKpiTarget(id: string, value: number): Promise<Result<{ id: string }>> {
  if (!Number.isFinite(value)) return { ok: false, error: "請輸入有效數字" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: row, error: e1 } = await supabase
    .from("business_rules")
    .select("id, config")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "sales_kpi_target")
    .maybeSingle();
  if (e1 || !row) return { ok: false, error: "找不到該目標值" };

  const cfg = row.config as KpiTargetConfig;
  if (value < cfg.min || value > cfg.max) {
    return { ok: false, error: `數值需介於 ${cfg.min} ~ ${cfg.max} ${cfg.unit}` };
  }
  const nextCfg: KpiTargetConfig = { ...cfg, value };

  const { error } = await supabase
    .from("business_rules")
    .update({ config: nextCfg })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, "儲存失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────────────────────
// HABC Thresholds
// ──────────────────────────────────────────────────────────────────────────

export async function listHabcThresholds(): Promise<HabcThresholdRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("business_rules")
    .select("id, config, sort_order")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "habc_threshold")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    sort_order: r.sort_order,
    config: r.config as HabcThresholdConfig,
  }));
}

export async function updateHabcThreshold(id: string, value: number): Promise<Result<{ id: string }>> {
  if (!Number.isFinite(value)) return { ok: false, error: "請輸入有效數字" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: row, error: e1 } = await supabase
    .from("business_rules")
    .select("id, config")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "habc_threshold")
    .maybeSingle();
  if (e1 || !row) return { ok: false, error: "找不到該閾值" };

  const cfg = row.config as HabcThresholdConfig;
  if (value < cfg.min || value > cfg.max) {
    return { ok: false, error: `數值需介於 ${cfg.min} ~ ${cfg.max} ${cfg.unit}` };
  }
  const nextCfg: HabcThresholdConfig = { ...cfg, value };

  const { error } = await supabase
    .from("business_rules")
    .update({ config: nextCfg })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, "儲存失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────────────────────
// Aggregate loader
// ──────────────────────────────────────────────────────────────────────────

export async function getKpiTargetsPageData() {
  const [kpis, habc] = await Promise.all([listSalesKpiTargets(), listHabcThresholds()]);
  const layer1 = kpis.filter((r) => r.config.layer === 1);
  const layer2 = kpis.filter((r) => r.config.layer === 2);
  return { layer1, layer2, habc };
}

export type KpiTargetsPageData = Awaited<ReturnType<typeof getKpiTargetsPageData>>;

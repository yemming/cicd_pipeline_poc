/**
 * M04L-12: Parts Warranty Used Parts Lifecycle — Domain Helper
 *
 * 舊件出入庫邏輯：每個 stage（removed/staged/under_review/...）的處理規則 + KPI 指標。
 *
 * 此 helper 與 parts-warranty.ts / parts-warranty-staging.ts 並存，但只負責
 * `parts_warranty_used_parts_lifecycle_rules` 表 + 衍生 KPI / FlowDiagram 資料。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  LIFECYCLE_STAGES,
  type LifecycleStage,
  type LifecycleRuleRow,
  type LifecycleStageStats,
  type UsedPartsKpis,
} from "./parts-warranty-used-parts.constants";

export {
  LIFECYCLE_STAGES,
};
export type {
  LifecycleStage,
  LifecycleRuleRow,
  LifecycleStageStats,
  UsedPartsKpis,
};

/**
 * status → lifecycle stage 映射（保留現有 items.status 不動，view layer 推導 stage）。
 * awaiting=under_review；approved=還在審但已過第一輪；shipped=return_to_oem；
 * disposed=destroyed；rejected=recycled。
 */
const STATUS_TO_STAGE: Record<string, LifecycleStage> = {
  awaiting: "staged",
  approved: "under_review",
  shipped: "return_to_oem",
  disposed: "destroyed",
  rejected: "recycled",
};

/** 撈所有 lifecycle rules（brand scope，依 stage + sort_order）。 */
export async function listLifecycleRules(): Promise<LifecycleRuleRow[]> {
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_warranty_used_parts_lifecycle_rules")
    .select("*")
    .eq("brand_id", brand)
    .order("stage", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LifecycleRuleRow[];
}

/**
 * FlowDiagram 用：每 stage 件數 + 平均停留天數 + 規則數。
 * 件數依 items.status 推導；avg 停留 = now - inbound_date (天)。
 */
export async function getLifecycleFlowData(): Promise<LifecycleStageStats[]> {
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();

  const [itemsRes, rulesRes] = await Promise.all([
    supabase
      .from("parts_warranty_used_parts_items")
      .select("status, inbound_date")
      .eq("brand_id", brand),
    supabase
      .from("parts_warranty_used_parts_lifecycle_rules")
      .select("stage, is_active")
      .eq("brand_id", brand),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (rulesRes.error) throw rulesRes.error;

  const counts = new Map<LifecycleStage, { count: number; days: number[] }>();
  const ruleCounts = new Map<
    LifecycleStage,
    { active: number; total: number }
  >();

  for (const stg of LIFECYCLE_STAGES) {
    counts.set(stg.key, { count: 0, days: [] });
    ruleCounts.set(stg.key, { active: 0, total: 0 });
  }

  for (const it of itemsRes.data ?? []) {
    const status = (it as { status?: string }).status;
    if (!status) continue;
    const stage = STATUS_TO_STAGE[status];
    if (!stage) continue;
    const bucket = counts.get(stage)!;
    bucket.count += 1;
    const inbound = (it as { inbound_date?: string | null }).inbound_date;
    if (inbound) {
      const days =
        (Date.now() - new Date(inbound).getTime()) / (1000 * 60 * 60 * 24);
      bucket.days.push(days);
    }
  }

  for (const r of rulesRes.data ?? []) {
    const stage = (r as { stage: LifecycleStage }).stage;
    const isActive = (r as { is_active: boolean }).is_active;
    const bucket = ruleCounts.get(stage);
    if (!bucket) continue;
    bucket.total += 1;
    if (isActive) bucket.active += 1;
  }

  return LIFECYCLE_STAGES.map((stg) => {
    const bucket = counts.get(stg.key)!;
    const rb = ruleCounts.get(stg.key)!;
    const avg =
      bucket.days.length > 0
        ? Math.round(
            (bucket.days.reduce((a, b) => a + b, 0) / bucket.days.length) * 10,
          ) / 10
        : null;
    return {
      stage: stg.key,
      label: stg.label,
      tone: stg.tone,
      count: bucket.count,
      avgStayDays: avg,
      rulesActive: rb.active,
      rulesTotal: rb.total,
    };
  });
}

export async function getUsedPartsKpis(): Promise<UsedPartsKpis> {
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_warranty_used_parts_items")
    .select("status")
    .eq("brand_id", brand);
  if (error) throw error;
  let staged = 0;
  let awaitingOem = 0;
  let destroyed = 0;
  for (const r of data ?? []) {
    const s = (r as { status: string }).status;
    if (s === "awaiting") staged += 1;
    else if (s === "approved") awaitingOem += 1;
    else if (s === "disposed") destroyed += 1;
  }
  return {
    totalItems: (data ?? []).length,
    staged,
    awaitingOem,
    destroyed,
  };
}

/** 一次撈完整 page data（page.tsx 用）。 */
export async function getUsedPartsLifecyclePageData(): Promise<{
  rules: LifecycleRuleRow[];
  flowData: LifecycleStageStats[];
  kpis: UsedPartsKpis;
  canEdit: boolean;
}> {
  const [rules, flowData, kpis, canEdit] = await Promise.all([
    listLifecycleRules(),
    getLifecycleFlowData(),
    getUsedPartsKpis(),
    hasPermission(PERMISSIONS.WARRANTY_SUBMIT),
  ]);
  return { rules, flowData, kpis, canEdit };
}

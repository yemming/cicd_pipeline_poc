/**
 * Domain Helper — 電訪問卷模板（/crm/sales/survey-templates, /crm/aftersales/survey-templates）
 *
 * 角色：銷售（成交追蹤）/ 售後（保養回訪）兩條業務線共用同一張 survey_templates 表。
 *   - 銷售側用 kind = 'sales'；售後 d5f66510 用 kind = 'aftersales'。
 *   - 問卷題目用 jsonb 存（questions 欄位）
 *   - 適用時機 / HABC 對象 / 問卷狀態 / 版本記錄 全走 metadata jsonb（v1 不開 typed column；
 *     metadata shape 統一在 sales-survey-templates.constants 定義，client/server 共用）
 *
 * 寫入走 src/lib/sales/survey-templates-actions.ts。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  APPLICABLE_TIMING_ORDER,
  readSurveyHabc,
  readSurveyStatus,
  readSurveyTiming,
  readSurveyVersions,
  type ApplicableTiming,
  type SurveyKind,
  type SurveyMetadata,
  type SurveyQuestion,
  type SurveyTemplateFilters,
  type SurveyTemplateKpi,
  type SurveyTemplateRow,
} from "./sales-survey-templates.constants";

export type {
  ApplicableTiming,
  SurveyKind,
  SurveyMetadata,
  SurveyQuestion,
  SurveyTemplateFilters,
  SurveyTemplateKpi,
  SurveyTemplateRow,
};

export type SurveyTemplateListResult = {
  rows: SurveyTemplateRow[];
  kpi: SurveyTemplateKpi;
  totalCount: number;
};

function normalizeMetadata(raw: unknown): SurveyMetadata {
  if (!raw || typeof raw !== "object") return {};
  return raw as SurveyMetadata;
}

function normalizeRow(r: Record<string, unknown>): SurveyTemplateRow {
  const meta = normalizeMetadata(r.metadata);
  return {
    id: r.id as string,
    brand_id: r.brand_id as string,
    kind: r.kind as SurveyKind,
    code: r.code as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    target_segment: (r.target_segment as string | null) ?? null,
    questions: Array.isArray(r.questions) ? (r.questions as SurveyQuestion[]) : [],
    effective_from: (r.effective_from as string | null) ?? null,
    effective_to: (r.effective_to as string | null) ?? null,
    is_active: Boolean(r.is_active),
    metadata: meta,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function computeKpi(rows: SurveyTemplateRow[]): SurveyTemplateKpi {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const by_timing: Partial<Record<ApplicableTiming, number>> = {};
  let active = 0;
  let draft = 0;
  let archived = 0;
  let this_month_modified = 0;
  for (const r of rows) {
    const s = readSurveyStatus(r.metadata);
    if (s === "active") active++;
    else if (s === "draft") draft++;
    else if (s === "archived") archived++;
    const t = readSurveyTiming(r.metadata);
    if (t) by_timing[t] = (by_timing[t] ?? 0) + 1;
    const u = new Date(r.updated_at);
    if (u.getUTCFullYear() === year && u.getUTCMonth() === month)
      this_month_modified++;
  }
  return {
    total: rows.length,
    active,
    draft,
    archived,
    this_month_modified,
    by_timing,
  };
}

export async function getSurveyTemplateListPageData(
  filters: SurveyTemplateFilters,
): Promise<SurveyTemplateListResult> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("survey_templates")
    .select(
      "id, brand_id, kind, code, name, description, target_segment, questions, effective_from, effective_to, is_active, metadata, created_at, updated_at",
    )
    .eq("brand_id", brand)
    .eq("kind", filters.kind);

  if (filters.status === "active") q = q.eq("is_active", true);
  if (filters.status === "inactive") q = q.eq("is_active", false);
  if (filters.q.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(
      `code.ilike.%${t}%,name.ilike.%${t}%,target_segment.ilike.%${t}%,description.ilike.%${t}%`,
    );
  }

  const [listRes, totalRes] = await Promise.all([
    q.order("code").limit(500),
    supabase
      .from("survey_templates")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .eq("kind", filters.kind),
  ]);

  if (listRes.error)
    throw new Error(`survey-templates list: ${listRes.error.message}`);

  let rows = (listRes.data ?? []).map((r) =>
    normalizeRow(r as Record<string, unknown>),
  );

  // metadata-based 二次過濾（meta_status / timing）
  if (filters.meta_status && filters.meta_status !== "all") {
    rows = rows.filter(
      (r) => readSurveyStatus(r.metadata) === filters.meta_status,
    );
  }
  if (filters.timing && filters.timing !== "all") {
    rows = rows.filter((r) => readSurveyTiming(r.metadata) === filters.timing);
  }

  // KPI 永遠以「未套用 meta_status / timing」前的整本 query 結果為基準
  // —— 已套用 status 過濾仍有意義（active/inactive 是真有意 typed column），
  // 但 KPI 數字要呼應 sidebar 數字，所以另外撈一次「整本 kind 內」做 KPI。
  const allRowsRes = await supabase
    .from("survey_templates")
    .select(
      "id, kind, is_active, metadata, updated_at, brand_id, code, name, questions, description, target_segment, effective_from, effective_to, created_at",
    )
    .eq("brand_id", brand)
    .eq("kind", filters.kind);
  const allRows = (allRowsRes.data ?? []).map((r) =>
    normalizeRow(r as Record<string, unknown>),
  );
  const kpi = computeKpi(allRows);

  return { rows, kpi, totalCount: totalRes.count ?? 0 };
}

// ──────────────────────────────────────────────────────────────────────────
// Detail
// ──────────────────────────────────────────────────────────────────────────

export async function getSurveyTemplateDetail(
  id: string,
): Promise<SurveyTemplateRow | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data, error } = await supabase
    .from("survey_templates")
    .select(
      "id, brand_id, kind, code, name, description, target_segment, questions, effective_from, effective_to, is_active, metadata, created_at, updated_at",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeRow(data as Record<string, unknown>);
}

// re-export pure helpers for server callers
export { readSurveyHabc, readSurveyStatus, readSurveyTiming, readSurveyVersions };
export { APPLICABLE_TIMING_ORDER };

/**
 * Domain Helper — 電訪問卷模板（/sales/crm/survey-templates）
 *
 * 角色：銷售（成交追蹤）/ 售後（保養回訪）兩條業務線共用同一張 survey_templates 表。
 *   - 預設只給銷售側用（kind = 'sales'）。未來售後頁面（d5f66510）可 reuse 此 helper、
 *     呼叫時帶 kind = 'aftersales' 即可。
 *   - 問卷題目用 jsonb 存（questions 欄位），結構為
 *       [{id, label, type:'single'|'multi'|'rating'|'text', options?:string[], required:boolean}]
 *
 * 寫入走 src/lib/sales/survey-templates-actions.ts。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

export type SurveyKind = "sales" | "aftersales";

export type SurveyQuestion = {
  id: string;
  label: string;
  type: "single" | "multi" | "rating" | "text";
  options?: string[];
  required: boolean;
};

export type SurveyTemplateFilters = {
  /** 'sales' | 'aftersales'，預設 'sales' */
  kind: SurveyKind;
  /** all | active | inactive */
  status: string;
  /** code / name / target_segment / description */
  q: string;
};

export type SurveyTemplateRow = {
  id: string;
  brand_id: string;
  kind: SurveyKind;
  code: string;
  name: string;
  description: string | null;
  target_segment: string | null;
  questions: SurveyQuestion[];
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SurveyTemplateListResult = {
  rows: SurveyTemplateRow[];
  totalCount: number;
};

export async function getSurveyTemplateListPageData(
  filters: SurveyTemplateFilters,
): Promise<SurveyTemplateListResult> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("survey_templates")
    .select(
      "id, brand_id, kind, code, name, description, target_segment, questions, effective_from, effective_to, is_active, created_at, updated_at",
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

  const rows = (listRes.data ?? []).map((r) => ({
    ...r,
    questions: Array.isArray(r.questions) ? (r.questions as SurveyQuestion[]) : [],
  })) as SurveyTemplateRow[];

  return { rows, totalCount: totalRes.count ?? 0 };
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
      "id, brand_id, kind, code, name, description, target_segment, questions, effective_from, effective_to, is_active, created_at, updated_at",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();

  if (error || !data) return null;

  return {
    ...data,
    questions: Array.isArray(data.questions)
      ? (data.questions as SurveyQuestion[])
      : [],
  } as SurveyTemplateRow;
}

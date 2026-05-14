"use server";

/**
 * Server Actions — 電訪問卷模板（/sales/crm/survey-templates）
 *
 * - 沿用 PERMISSIONS.CUSTOMER_VIEW / CUSTOMER_EDIT（CRM 模組共用權限，問卷模板屬於 CRM 設定範疇）
 * - Result 型別、不 redirect、由 client 自決導航
 * - kind = 'sales' | 'aftersales'；同一支 action 兩個業務頁面共用
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  SurveyKind,
  SurveyQuestion,
} from "@/domain/sales-survey-templates";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type SurveyTemplateInput = {
  /** 留空 → 自動產生 SST001 / AST001 ... */
  code?: string;
  name: string;
  kind: SurveyKind;
  description?: string | null;
  target_segment?: string | null;
  questions: SurveyQuestion[];
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean;
};

/**
 * 同一份問卷 schema 同時被 /sales/crm/survey-templates 與 /aftersales/crm/survey-templates 兩條路徑掛載。
 * revalidate 同時打兩條（kind 只是 filter，路徑前綴 router cache 看的是 pathname），保守 invalidate。
 */
function listPaths(kind: SurveyKind): string[] {
  return [
    `/sales/crm/survey-templates?kind=${kind}`,
    `/aftersales/crm/survey-templates?kind=${kind}`,
  ];
}

function detailPaths(id: string): string[] {
  return [
    `/sales/crm/survey-templates/${id}`,
    `/aftersales/crm/survey-templates/${id}`,
  ];
}

function revalidateAll(paths: string[]): void {
  for (const p of paths) revalidatePath(p);
}

function trim(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function mapDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    if (error.message.includes("survey_templates_brand_kind_code_uniq"))
      return "問卷代碼已存在（同品牌、同類型下不可重複）";
    return "資料重複（unique constraint）";
  }
  if (error.code === "23514") {
    if (error.message.includes("survey_templates_kind_check"))
      return "問卷類型不合法（只接受 sales / aftersales）";
  }
  return `儲存失敗：${error.message}`;
}

async function genCode(kind: SurveyKind): Promise<string> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const prefix = kind === "sales" ? "SST" : "AST";
  const { data } = await supabase
    .from("survey_templates")
    .select("code")
    .eq("brand_id", brand)
    .eq("kind", kind)
    .ilike("code", `${prefix}%`)
    .order("code", { ascending: false })
    .limit(50);
  let max = 0;
  for (const row of data ?? []) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(row.code);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function sanitizeQuestions(qs: SurveyQuestion[]): SurveyQuestion[] {
  return (qs ?? []).map((q, idx) => {
    const id = (q.id ?? "").trim() || `q${idx + 1}`;
    const label = (q.label ?? "").trim();
    const type =
      q.type === "single" ||
      q.type === "multi" ||
      q.type === "rating" ||
      q.type === "text"
        ? q.type
        : "text";
    const required = Boolean(q.required);
    const options =
      type === "single" || type === "multi" || type === "rating"
        ? (q.options ?? []).map((o) => String(o).trim()).filter(Boolean)
        : undefined;
    return options !== undefined
      ? { id, label, type, required, options }
      : { id, label, type, required };
  });
}

function payloadFromInput(input: SurveyTemplateInput) {
  return {
    name: input.name.trim(),
    description: trim(input.description ?? null),
    target_segment: trim(input.target_segment ?? null),
    questions: sanitizeQuestions(input.questions),
    effective_from: trim(input.effective_from ?? null),
    effective_to: trim(input.effective_to ?? null),
  };
}

export async function createSurveyTemplateAction(
  input: SurveyTemplateInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };
  if (!input.name?.trim()) return { ok: false, error: "問卷名稱必填" };
  if (input.kind !== "sales" && input.kind !== "aftersales")
    return { ok: false, error: "問卷類型不合法" };

  const code = input.code?.trim() || (await genCode(input.kind));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("survey_templates")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
      kind: input.kind,
      code,
      ...payloadFromInput(input),
      is_active: input.is_active ?? true,
      created_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: mapDbError(error) };
  revalidateAll(listPaths(input.kind));
  return { ok: true, data: { id: data.id } };
}

export async function updateSurveyTemplateAction(
  id: string,
  input: SurveyTemplateInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!id) return { ok: false, error: "缺少 survey id" };
  if (!input.name?.trim()) return { ok: false, error: "問卷名稱必填" };
  if (!input.code?.trim()) return { ok: false, error: "問卷代碼必填" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("survey_templates")
    .update({
      code: input.code.trim(),
      ...payloadFromInput(input),
      ...(input.is_active === undefined ? {} : { is_active: input.is_active }),
    })
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);

  if (error) return { ok: false, error: mapDbError(error) };
  revalidateAll(listPaths(input.kind));
  revalidateAll(detailPaths(id));
  return { ok: true, data: { id } };
}

export async function setSurveyTemplateActiveAction(
  id: string,
  next: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("survey_templates")
    .update({ is_active: next })
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id)
    .select("kind")
    .single();
  if (error) return { ok: false, error: mapDbError(error) };
  if (data?.kind) revalidateAll(listPaths(data.kind as SurveyKind));
  revalidateAll(detailPaths(id));
  return { ok: true, data: { id } };
}

export async function deleteSurveyTemplateAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("survey_templates")
    .select("kind")
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id)
    .maybeSingle();

  const { error } = await supabase
    .from("survey_templates")
    .delete()
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) {
    if (error.code === "23503")
      return {
        ok: false,
        error: "此問卷已被電訪紀錄引用，無法刪除。建議改用「停用」保留歷史。",
      };
    return { ok: false, error: mapDbError(error) };
  }
  if (row?.kind) revalidateAll(listPaths(row.kind as SurveyKind));
  return { ok: true, data: { id } };
}

"use server";

/**
 * Server Actions — 電訪工作檯（/sales/crm/call-tasks）
 *
 * - 共用 PERMISSIONS.CUSTOMER_VIEW / CUSTOMER_EDIT（CRM 模組共用權限）
 * - Result 型別、不 redirect、由 client 自決導航
 * - kind = 'sales' | 'aftersales'，預設給 sales，後續售後頁面 reuse
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  CallTaskResult,
  CallTaskStatus,
} from "@/domain/sales-call-tasks.constants";
import type { SurveyKind } from "@/domain/sales-survey-templates";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CallTaskInput = {
  kind: SurveyKind;
  customer_id: string;
  survey_template_id?: string | null;
  assignee_id?: string | null;
  scheduled_at?: string | null;
  status?: CallTaskStatus;
  call_result?: CallTaskResult | null;
  attempt_count?: number;
  last_attempt_at?: string | null;
  answers?: Record<string, unknown>;
  notes?: string | null;
};

/**
 * 同一份 call_tasks schema 同時掛在 /sales/crm/call-tasks（kind=sales）
 * 與 /aftersales/crm/call-tasks（kind=aftersales）兩條路徑下。
 * revalidate 同時打兩條，保守 invalidate Router cache。
 */
function listPaths(kind: SurveyKind): string[] {
  return [
    `/sales/crm/call-tasks?kind=${kind}`,
    `/aftersales/crm/call-tasks?kind=${kind}`,
  ];
}

function detailPaths(id: string): string[] {
  return [
    `/sales/crm/call-tasks/${id}`,
    `/aftersales/crm/call-tasks/${id}`,
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
  if (error.code === "23503")
    return "找不到對應的客戶或問卷模板（外鍵錯誤）";
  if (error.code === "23514") {
    if (error.message.includes("call_tasks_kind_check"))
      return "任務類型不合法（只接受 sales / aftersales）";
    if (error.message.includes("call_tasks_status_check"))
      return "狀態不合法";
    if (error.message.includes("call_tasks_call_result_check"))
      return "通話結果不合法";
  }
  return `儲存失敗：${error.message}`;
}

function payloadFromInput(input: CallTaskInput, isCreate: boolean) {
  const base: Record<string, unknown> = {
    customer_id: input.customer_id,
    survey_template_id: input.survey_template_id ?? null,
    assignee_id: input.assignee_id ?? null,
    scheduled_at: trim(input.scheduled_at ?? null),
    notes: trim(input.notes ?? null),
  };
  if (input.status !== undefined) base.status = input.status;
  if (input.call_result !== undefined)
    base.call_result = input.call_result ?? null;
  if (input.attempt_count !== undefined)
    base.attempt_count = input.attempt_count;
  if (input.last_attempt_at !== undefined)
    base.last_attempt_at = trim(input.last_attempt_at ?? null);
  if (input.answers !== undefined) base.answers = input.answers;
  if (isCreate) {
    if (base.status === undefined) base.status = "pending";
    if (base.attempt_count === undefined) base.attempt_count = 0;
    if (base.answers === undefined) base.answers = {};
  }
  return base;
}

export async function createCallTaskAction(
  input: CallTaskInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };
  if (input.kind !== "sales" && input.kind !== "aftersales")
    return { ok: false, error: "任務類型不合法" };
  if (!input.customer_id) return { ok: false, error: "客戶必選" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("call_tasks")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
      kind: input.kind,
      ...payloadFromInput(input, true),
      created_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: mapDbError(error) };
  revalidateAll(listPaths(input.kind));
  return { ok: true, data: { id: data.id } };
}

export async function updateCallTaskAction(
  id: string,
  input: CallTaskInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!id) return { ok: false, error: "缺少 task id" };
  if (!input.customer_id) return { ok: false, error: "客戶必選" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("call_tasks")
    .update(payloadFromInput(input, false))
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);

  if (error) return { ok: false, error: mapDbError(error) };
  revalidateAll(listPaths(input.kind));
  revalidateAll(detailPaths(id));
  return { ok: true, data: { id } };
}

/**
 * 業務捷徑：把任務標記為「進行中」並 +1 attempt_count（撥打按鈕用）
 */
export async function startCallTaskAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data: row } = await supabase
    .from("call_tasks")
    .select("id, kind, attempt_count")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!row) return { ok: false, error: "找不到任務" };

  const { error } = await supabase
    .from("call_tasks")
    .update({
      status: "in_progress",
      attempt_count: (row.attempt_count ?? 0) + 1,
      last_attempt_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };
  revalidateAll(listPaths(row.kind as SurveyKind));
  revalidateAll(detailPaths(id));
  return { ok: true, data: { id } };
}

export async function deleteCallTaskAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data: row } = await supabase
    .from("call_tasks")
    .select("kind")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();

  const { error } = await supabase
    .from("call_tasks")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };
  if (row?.kind) revalidateAll(listPaths(row.kind as SurveyKind));
  return { ok: true, data: { id } };
}

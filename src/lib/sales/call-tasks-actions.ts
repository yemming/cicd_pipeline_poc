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
  call_type?: string | null;
  status?: CallTaskStatus;
  call_result?: CallTaskResult | null;
  attempt_count?: number;
  last_attempt_at?: string | null;
  answers?: Record<string, unknown>;
  notes?: string | null;
  metadata?: Record<string, unknown>;
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
  if (input.call_type !== undefined) base.call_type = input.call_type ?? null;
  if (input.metadata !== undefined) base.metadata = input.metadata;
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

/**
 * 工作台「💾 儲存通話記錄」— 一次寫入 result + next_followup_date +
 * competitor_brand + notes，狀態自動推進 completed / skipped。
 *
 * CRM03A/B spec § save-call-row：result + 下次跟進日 + 競品 + 備註。
 */
export async function recordCallResultAction(
  id: string,
  patch: {
    result: CallTaskResult;
    nextDate?: string | null;
    competitor?: string | null;
    note?: string | null;
    /** 售後 D+3 / NPS 訪談用：0–10 分，省略時不寫入 */
    npsScore?: number | null;
  },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!id) return { ok: false, error: "缺少 task id" };
  if (!patch.result) return { ok: false, error: "請選擇通話結果" };
  if (
    patch.npsScore != null &&
    (!Number.isInteger(patch.npsScore) ||
      patch.npsScore < 0 ||
      patch.npsScore > 10)
  )
    return { ok: false, error: "NPS 分數必須在 0–10 之間的整數" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data: row } = await supabase
    .from("call_tasks")
    .select("id, kind, customer_id, survey_template_id, attempt_count, metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!row) return { ok: false, error: "找不到任務" };

  // 結果 → 狀態映射：refused 結案 → skipped；其他 → completed（接通 / 改期都算結案這通）
  const status: CallTaskStatus =
    patch.result === "refused" ? "skipped" : "completed";

  const meta: Record<string, unknown> = {
    ...(row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {}),
  };
  if (patch.nextDate !== undefined) {
    if (patch.nextDate) meta.next_followup_date = patch.nextDate;
    else delete meta.next_followup_date;
  }
  if (patch.competitor !== undefined) {
    if (patch.competitor) meta.competitor_brand = patch.competitor;
    else delete meta.competitor_brand;
  }
  if (patch.npsScore !== undefined) {
    if (patch.npsScore != null) meta.nps_score = patch.npsScore;
    else delete meta.nps_score;
  }

  const { error } = await supabase
    .from("call_tasks")
    .update({
      status,
      call_result: patch.result,
      attempt_count: (row.attempt_count ?? 0) + 1,
      last_attempt_at: new Date().toISOString(),
      notes: trim(patch.note ?? null),
      metadata: meta,
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };

  // 售後 D+3 / NPS 任務 + 有寫 score → 同步 insert nps_responses（call_task_id 連結）
  // 失敗不擋主流程（已 update 成功），只 log。
  if (
    row.kind === "aftersales" &&
    patch.result === "answered" &&
    patch.npsScore != null
  ) {
    const category =
      patch.npsScore >= 9
        ? "promoter"
        : patch.npsScore >= 7
          ? "passive"
          : "detractor";
    const { error: npsErr } = await supabase.from("nps_responses").insert({
      brand_id: brand,
      kind: "aftersales",
      customer_id: row.customer_id,
      call_task_id: id,
      survey_template_id: row.survey_template_id,
      score: patch.npsScore,
      category,
      comment: trim(patch.note ?? null),
      responded_at: new Date().toISOString(),
    });
    if (npsErr) {
      console.warn(
        `[recordCallResultAction] nps_responses insert 失敗（不擋主流程）: ${npsErr.message}`,
      );
    }
  }

  revalidateAll(listPaths(row.kind as SurveyKind));
  revalidateAll(detailPaths(id));
  return { ok: true, data: { id } };
}

/**
 * 工作台「📅 改期」— 純改 scheduled_at，狀態維持 pending。
 */
export async function rescheduleCallTaskAction(
  id: string,
  newDate: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!id) return { ok: false, error: "缺少 task id" };
  if (!newDate) return { ok: false, error: "請選擇新的撥打時間" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data: row } = await supabase
    .from("call_tasks")
    .select("id, kind")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!row) return { ok: false, error: "找不到任務" };

  // 接受 YYYY-MM-DD 或完整 ISO；YYYY-MM-DD 自動補 09:00 Taipei
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(newDate)
    ? `${newDate}T09:00:00+08:00`
    : newDate;

  const { error } = await supabase
    .from("call_tasks")
    .update({
      scheduled_at: iso,
      status: "pending",
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };

  revalidateAll(listPaths(row.kind as SurveyKind));
  revalidateAll(detailPaths(id));
  return { ok: true, data: { id } };
}

/**
 * 工作台「略過今日」— 維持 pending、scheduled_at 推遲一天。
 */
export async function skipCallTaskTodayAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data: row } = await supabase
    .from("call_tasks")
    .select("id, kind, scheduled_at")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!row) return { ok: false, error: "找不到任務" };

  const base = row.scheduled_at ? new Date(row.scheduled_at) : new Date();
  base.setDate(base.getDate() + 1);

  const { error } = await supabase
    .from("call_tasks")
    .update({ scheduled_at: base.toISOString() })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };

  revalidateAll(listPaths(row.kind as SurveyKind));
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

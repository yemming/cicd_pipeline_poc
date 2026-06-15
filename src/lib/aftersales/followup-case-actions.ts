"use server";

/**
 * Server actions — followup_cases / followup_events
 *
 * Result<T> pattern。Spec：05_增項閉環_完整子模組.html
 *  - logSaContactAction（D+3 / D+10 SA 聯繫紀錄）
 *  - markSupervisorIntervenedAction（主管介入記錄）
 *  - markCustomerAgreedAction（車主同意 → closed_won；可選帶 appointment_id）
 *  - markLongTermAction（轉長期追蹤）
 *  - closeLostAction（明確結案不修）
 *  - sendLineReminderAction（發 Line 提醒 + 真接 Notification Hub 推 LINE）
 *  - addNoteAction（一般備註）
 *
 * 寫每個 action 時都同步 INSERT 一筆 followup_events。
 */

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { notifications } from "@/lib/notifications";
import { createAppointmentAction } from "@/lib/aftersales/appointment-actions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE = "/parts/aftersales/followups";

type Outcome = "reached" | "no_answer" | "left_message" | "agreed" | "declined" | "pending";

async function loadCase(id: string) {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("followup_cases")
    .select(
      "id, brand_id, status, safety_level, estimated_fee, sa_name, last_contacted_at, next_contact_at",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error || !data) return { ok: false as const, error: "找不到追蹤案件" };
  return { ok: true as const, brand, row: data };
}

async function insertEvent(payload: {
  brand_id: string;
  case_id: string;
  event_type: string;
  outcome?: Outcome | null;
  body?: string | null;
  acted_by_name?: string | null;
}): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("followup_events")
    .insert({
      brand_id: payload.brand_id,
      case_id: payload.case_id,
      event_type: payload.event_type,
      outcome: payload.outcome ?? null,
      body: payload.body ?? null,
      acted_by_name: payload.acted_by_name ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[followup-case-actions] insertEvent error", error);
    return null;
  }
  return data.id;
}

export async function logSaContactAction(
  caseId: string,
  input: { outcome: Outcome; body?: string },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const c = await loadCase(caseId);
  if (!c.ok) return { ok: false, error: c.error };
  if (c.row.status === "closed_won" || c.row.status === "closed_lost")
    return { ok: false, error: "已結案的案件不可記聯繫" };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const eventId = await insertEvent({
    brand_id: c.brand,
    case_id: caseId,
    event_type: "sa_contact",
    outcome: input.outcome,
    body: input.body?.trim() || null,
    acted_by_name: c.row.sa_name ?? null,
  });
  if (!eventId) return { ok: false, error: "寫入聯繫紀錄失敗" };

  // 推算下次聯繫日（D+7）
  const next = new Date();
  next.setDate(next.getDate() + 7);
  await supabase
    .from("followup_cases")
    .update({
      last_contacted_at: now,
      next_contact_at: next.toISOString().slice(0, 10),
      updated_at: now,
    })
    .eq("id", caseId)
    .eq("brand_id", c.brand);

  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/${caseId}`);
  return { ok: true, data: { id: eventId } };
}

export async function markSupervisorIntervenedAction(
  caseId: string,
  body: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const c = await loadCase(caseId);
  if (!c.ok) return { ok: false, error: c.error };
  if (!body?.trim()) return { ok: false, error: "請填寫主管介入紀錄內容" };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const eventId = await insertEvent({
    brand_id: c.brand,
    case_id: caseId,
    event_type: "supervisor_intervene",
    outcome: "pending",
    body: body.trim(),
    acted_by_name: "主管",
  });
  if (!eventId) return { ok: false, error: "寫入主管介入紀錄失敗" };

  await supabase
    .from("followup_cases")
    .update({ status: "escalated", updated_at: now })
    .eq("id", caseId)
    .eq("brand_id", c.brand);

  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/${caseId}`);
  return { ok: true, data: { id: eventId } };
}

/**
 * 車主同意 + 自動建立預約（一次完成）。
 * UI 端在 AgreedModal 填入預約日期後呼叫此 action；
 * 內部先 createAppointmentAction 取得 appointment_id，
 * 再傳給 markCustomerAgreedAction 完成閉環。
 */
export async function markCustomerAgreedWithAppointmentAction(
  caseId: string,
  input: {
    appointment_date: string; // YYYY-MM-DD，必填
    body?: string;
    recovered_amount?: number;
    customer_id?: string | null;
    vehicle_id?: string | null;
    notes?: string | null;
  },
): Promise<ActionResult<{ id: string; appointment_id: string | null }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!input.appointment_date) return { ok: false, error: "預約日期必填" };

  // 先建立預約（預設時段 09:00，業務類型「增項閉環回廠」）
  const apptResult = await createAppointmentAction({
    appointment_date: input.appointment_date,
    appointment_time: "09:00",
    service_type: "增項閉環回廠",
    customer_id: input.customer_id ?? null,
    vehicle_id: input.vehicle_id ?? null,
    notes: input.notes ?? null,
    source: `followup_case:${caseId}`,
  });

  // 預約建立失敗時記錄警告但不阻擋閉環（避免因預約模組問題卡住主流程）
  const appointment_id = apptResult.ok ? apptResult.data.id : null;
  if (!apptResult.ok) {
    console.warn(
      `[followup] 建立預約失敗（caseId=${caseId}）：${apptResult.error}，仍繼續閉環`,
    );
  }

  // 再呼叫 markCustomerAgreedAction 完成閉環（不再走 requirePermission，上面已驗）
  const c = await loadCase(caseId);
  if (!c.ok) return { ok: false, error: c.error };
  if (c.row.status === "closed_won" || c.row.status === "closed_lost")
    return { ok: false, error: "案件已結案" };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const recovered =
    typeof input.recovered_amount === "number" && input.recovered_amount >= 0
      ? input.recovered_amount
      : Number(c.row.estimated_fee ?? 0);

  const eventBody = input.body?.trim()
    ? `${input.body.trim()}（預約日：${input.appointment_date}）`
    : `✅ 車主同意 → 建立預約回廠（預約日：${input.appointment_date}）`;

  const eventId = await insertEvent({
    brand_id: c.brand,
    case_id: caseId,
    event_type: "customer_agreed",
    outcome: "agreed",
    body: eventBody,
    acted_by_name: c.row.sa_name ?? null,
  });
  if (!eventId) return { ok: false, error: "寫入決策紀錄失敗" };

  await supabase
    .from("followup_cases")
    .update({
      status: "closed_won",
      closed_at: now,
      closed_reason: "車主同意回廠",
      recovered_amount: recovered,
      appointment_id,
      updated_at: now,
    })
    .eq("id", caseId)
    .eq("brand_id", c.brand);

  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/${caseId}`);
  return { ok: true, data: { id: eventId, appointment_id } };
}

export async function markCustomerAgreedAction(
  caseId: string,
  input: { appointment_id?: string | null; recovered_amount?: number; body?: string },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const c = await loadCase(caseId);
  if (!c.ok) return { ok: false, error: c.error };
  if (c.row.status === "closed_won" || c.row.status === "closed_lost")
    return { ok: false, error: "案件已結案" };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const recovered =
    typeof input.recovered_amount === "number" && input.recovered_amount >= 0
      ? input.recovered_amount
      : Number(c.row.estimated_fee ?? 0);

  const eventId = await insertEvent({
    brand_id: c.brand,
    case_id: caseId,
    event_type: "customer_agreed",
    outcome: "agreed",
    body: input.body?.trim() || "✅ 車主同意 → 建立預約回廠",
    acted_by_name: c.row.sa_name ?? null,
  });
  if (!eventId) return { ok: false, error: "寫入決策紀錄失敗" };

  await supabase
    .from("followup_cases")
    .update({
      status: "closed_won",
      closed_at: now,
      closed_reason: "車主同意回廠",
      recovered_amount: recovered,
      appointment_id: input.appointment_id ?? null,
      updated_at: now,
    })
    .eq("id", caseId)
    .eq("brand_id", c.brand);

  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/${caseId}`);
  return { ok: true, data: { id: eventId } };
}

export async function markLongTermAction(
  caseId: string,
  body?: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const c = await loadCase(caseId);
  if (!c.ok) return { ok: false, error: c.error };
  if (c.row.status === "closed_won" || c.row.status === "closed_lost")
    return { ok: false, error: "案件已結案" };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const eventId = await insertEvent({
    brand_id: c.brand,
    case_id: caseId,
    event_type: "long_term_marked",
    outcome: "pending",
    body: body?.trim() || "轉為長期追蹤（下次回廠提醒）",
    acted_by_name: c.row.sa_name ?? null,
  });
  if (!eventId) return { ok: false, error: "寫入失敗" };

  await supabase
    .from("followup_cases")
    .update({ status: "long_term", updated_at: now })
    .eq("id", caseId)
    .eq("brand_id", c.brand);

  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/${caseId}`);
  return { ok: true, data: { id: eventId } };
}

export async function closeLostAction(
  caseId: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!reason?.trim()) return { ok: false, error: "請填寫結案原因" };
  const c = await loadCase(caseId);
  if (!c.ok) return { ok: false, error: c.error };
  if (c.row.status === "closed_won" || c.row.status === "closed_lost")
    return { ok: false, error: "案件已結案" };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const eventId = await insertEvent({
    brand_id: c.brand,
    case_id: caseId,
    event_type: "closed_lost",
    outcome: "declined",
    body: reason.trim(),
    acted_by_name: c.row.sa_name ?? null,
  });
  if (!eventId) return { ok: false, error: "寫入結案紀錄失敗" };

  await supabase
    .from("followup_cases")
    .update({
      status: "closed_lost",
      closed_at: now,
      closed_reason: reason.trim(),
      updated_at: now,
    })
    .eq("id", caseId)
    .eq("brand_id", c.brand);

  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/${caseId}`);
  return { ok: true, data: { id: eventId } };
}

export async function sendLineReminderAction(
  caseId: string,
  body: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const c = await loadCase(caseId);
  if (!c.ok) return { ok: false, error: c.error };
  if (!body?.trim()) return { ok: false, error: "請填寫提醒訊息" };

  // 讀完整案件資訊（供通知用）
  const supabase = await createClient();
  const { data: fullCase } = await supabase
    .from("followup_cases")
    .select("case_no, title, customer_name")
    .eq("id", caseId)
    .eq("brand_id", c.brand)
    .maybeSingle();

  const eventId = await insertEvent({
    brand_id: c.brand,
    case_id: caseId,
    event_type: "line_reminder",
    outcome: "reached",
    body: body.trim(),
    acted_by_name: c.row.sa_name ?? null,
  });
  if (!eventId) return { ok: false, error: "紀錄失敗" };

  // 非阻塞推 Notification Hub（followup.line_reminder 事件）
  // 若尚未設定訂閱或通知目標，dispatch 會靜默忽略（0 recipients）
  const notificationPayload = {
    caseId,
    caseNo: fullCase?.case_no ?? "",
    title: fullCase?.title ?? "",
    customerName: fullCase?.customer_name ?? "",
    saName: c.row.sa_name ?? "",
    body: body.trim(),
    brand: c.brand,
  };
  after(async () => {
    try {
      await notifications.dispatch({
        code: "followup.line_reminder",
        payload: notificationPayload,
      });
    } catch (err) {
      // 通知失敗不影響主流程；僅 log 供 debug
      console.error("[followup-case-actions] LINE 提醒推送失敗", err);
    }
  });

  revalidatePath(`${PAGE}/${caseId}`);
  return { ok: true, data: { id: eventId } };
}

export async function addNoteAction(
  caseId: string,
  body: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const c = await loadCase(caseId);
  if (!c.ok) return { ok: false, error: c.error };
  if (!body?.trim()) return { ok: false, error: "請填寫備註內容" };

  const eventId = await insertEvent({
    brand_id: c.brand,
    case_id: caseId,
    event_type: "note",
    body: body.trim(),
    acted_by_name: c.row.sa_name ?? null,
  });
  if (!eventId) return { ok: false, error: "寫入備註失敗" };
  revalidatePath(`${PAGE}/${caseId}`);
  return { ok: true, data: { id: eventId } };
}

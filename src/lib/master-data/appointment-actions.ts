"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { AppointmentFieldKey } from "./appointment-form-types";

import { getActiveScope } from "@/lib/scope/active-scope";

const STATUSES = ["booked", "checked_in", "in_progress", "done", "cancelled", "no_show"] as const;
type Status = (typeof STATUSES)[number];

const SERVICE_TYPES = ["general", "scheduled_maintenance", "repair", "pdi", "other"] as const;
type ServiceType = (typeof SERVICE_TYPES)[number];

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Partial<Record<AppointmentFieldKey, string>> };

export type AppointmentInput = {
  id?: string;
  customer_id: string;
  vehicle_id?: string | null;
  appt_no?: string | null;
  scheduled_at: string; // 'YYYY-MM-DDTHH:mm' (Asia/Taipei local)
  duration_minutes?: number | null;
  service_type?: ServiceType | null;
  mileage_at_appointment?: number | null;
  status?: Status | null;
  advisor_id?: string | null;
  notes?: string | null;
};

function trim(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function pickStatus(raw: string | null | undefined): Status {
  const v = String(raw ?? "booked");
  return (STATUSES as readonly string[]).includes(v) ? (v as Status) : "booked";
}

function pickServiceType(raw: string | null | undefined): ServiceType {
  const v = String(raw ?? "general");
  return (SERVICE_TYPES as readonly string[]).includes(v) ? (v as ServiceType) : "general";
}

function mapDbError(error: { code?: string; message: string }): {
  error: string;
  fieldErrors?: Partial<Record<AppointmentFieldKey, string>>;
} {
  if (error.code === "23505" && error.message.includes("service_appointments_brand_appt_no_unique")) {
    return {
      error: "預約單號重複",
      fieldErrors: { appt_no: "此預約單號已存在，請改一個或留空自動產生" },
    };
  }
  if (error.code === "23503" && error.message.includes("customer_id")) {
    return {
      error: "客戶不存在或已被移除",
      fieldErrors: { customer_id: "請重新選擇客戶" },
    };
  }
  if (error.code === "23503" && error.message.includes("vehicle_id")) {
    return {
      error: "車輛不存在或已被移除",
      fieldErrors: { vehicle_id: "請重新選擇車輛" },
    };
  }
  return { error: `儲存失敗：${error.message}` };
}

/**
 * 自動產生 appt_no — 簡易版：A-{YYYYMMDD}-{6 碼隨機數字}。
 * Wave 2.x 之後改吃 document_number_rules 表的 pattern。
 */
function genApptNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `A-${ymd}-${rand}`;
}

/**
 * datetime-local 沒帶 timezone，視為 Asia/Taipei (+08:00)，轉 UTC ISO。
 * 台灣不採夏令所以固定 +08:00。
 *   '2026-05-15T10:30' → '2026-05-15T02:30:00.000Z'
 */
function localTaipeiToUtcIso(local: string): string {
  if (!local) return "";
  return new Date(`${local}:00+08:00`).toISOString();
}

function buildPayload(input: AppointmentInput) {
  const sched = (input.scheduled_at ?? "").trim();
  return {
    customer_id: (input.customer_id ?? "").trim(),
    vehicle_id: trim(input.vehicle_id ?? null),
    appt_no: trim(input.appt_no ?? null) ?? genApptNo(),
    scheduled_at: sched ? localTaipeiToUtcIso(sched) : "",
    duration_minutes: input.duration_minutes ?? 60,
    service_type: pickServiceType(input.service_type),
    mileage_at_appointment: input.mileage_at_appointment ?? null,
    status: pickStatus(input.status),
    advisor_id: trim(input.advisor_id ?? null),
    notes: trim(input.notes ?? null),
  };
}

export async function createAppointmentAction(
  input: AppointmentInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.APPOINTMENT_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };

  const payload = buildPayload(input);
  const fieldErrors: Partial<Record<AppointmentFieldKey, string>> = {};
  if (!payload.customer_id) fieldErrors.customer_id = "必選";
  if (!payload.scheduled_at) fieldErrors.scheduled_at = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_appointments")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
      ...payload,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  revalidatePath("/admin/master-data/appointments");
  return { ok: true, data: { id: data.id } };
}

export async function updateAppointmentAction(
  id: string,
  input: AppointmentInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.APPOINTMENT_EDIT);
  if (!id) return { ok: false, error: "缺少 appointment id" };

  const payload = buildPayload(input);
  const fieldErrors: Partial<Record<AppointmentFieldKey, string>> = {};
  if (!payload.customer_id) fieldErrors.customer_id = "必選";
  if (!payload.scheduled_at) fieldErrors.scheduled_at = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_appointments")
    .update(payload)
    .eq("id", id);
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  revalidatePath("/admin/master-data/appointments");
  revalidatePath(`/admin/master-data/appointments/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteAppointmentAction(
  id: string,
): Promise<ActionResult<null>> {
  await requirePermission(PERMISSIONS.APPOINTMENT_EDIT);
  if (!id) return { ok: false, error: "缺少 appointment id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("service_appointments")
    .delete()
    .eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "此預約被工單引用，無法刪除。請改用「已取消」狀態保留歷史。",
      };
    }
    return { ok: false, error: `刪除失敗：${error.message}` };
  }
  revalidatePath("/admin/master-data/appointments");
  return { ok: true, data: null };
}

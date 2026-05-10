"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { AppointmentFormState } from "./appointment-form-types";

import { getActiveScope } from "@/lib/scope/active-scope";
const STATUSES = ["booked", "checked_in", "in_progress", "done", "cancelled", "no_show"] as const;
type Status = (typeof STATUSES)[number];

const SERVICE_TYPES = ["general", "scheduled_maintenance", "repair", "pdi", "other"] as const;
type ServiceType = (typeof SERVICE_TYPES)[number];

function pickStatus(raw: FormDataEntryValue | null): Status {
  const v = String(raw ?? "booked");
  return (STATUSES as readonly string[]).includes(v) ? (v as Status) : "booked";
}

function pickServiceType(raw: FormDataEntryValue | null): ServiceType {
  const v = String(raw ?? "general");
  return (SERVICE_TYPES as readonly string[]).includes(v) ? (v as ServiceType) : "general";
}

function strOrNull(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  return v.length === 0 ? null : v;
}

function numOrNull(raw: FormDataEntryValue | null): number | null {
  const v = String(raw ?? "").trim();
  if (v.length === 0) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(raw: FormDataEntryValue | null): number | null {
  const v = String(raw ?? "").trim();
  if (v.length === 0) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function mapDbError(error: { code?: string; message: string }): AppointmentFormState {
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

function pickPayload(fd: FormData) {
  const rawSched = String(fd.get("scheduled_at") ?? "").trim();
  return {
    customer_id: String(fd.get("customer_id") ?? "").trim(),
    vehicle_id: strOrNull(fd.get("vehicle_id")),
    appt_no: strOrNull(fd.get("appt_no")) ?? genApptNo(),
    scheduled_at: rawSched ? localTaipeiToUtcIso(rawSched) : "",
    duration_minutes: intOrNull(fd.get("duration_minutes")) ?? 60,
    service_type: pickServiceType(fd.get("service_type")),
    mileage_at_appointment: numOrNull(fd.get("mileage_at_appointment")),
    status: pickStatus(fd.get("status")),
    advisor_id: strOrNull(fd.get("advisor_id")),
    notes: strOrNull(fd.get("notes")),
  };
}

export async function createAppointmentAction(
  _prevState: AppointmentFormState,
  fd: FormData,
): Promise<AppointmentFormState> {
  await requirePermission(PERMISSIONS.APPOINTMENT_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) redirect("/login");

  const payload = pickPayload(fd);
  const fieldErrors: AppointmentFormState["fieldErrors"] = {};
  if (!payload.customer_id) fieldErrors.customer_id = "必選";
  if (!payload.scheduled_at) fieldErrors.scheduled_at = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("service_appointments").insert({
    brand_id: (await getActiveScope()).brand_id,
    ...payload,
    created_by: ctx.userId,
  });
  if (error) return mapDbError(error);

  revalidatePath("/admin/master-data/appointments");
  redirect("/admin/master-data/appointments");
}

export async function updateAppointmentAction(
  _prevState: AppointmentFormState,
  fd: FormData,
): Promise<AppointmentFormState> {
  await requirePermission(PERMISSIONS.APPOINTMENT_EDIT);

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "缺少 appointment id" };

  const payload = pickPayload(fd);
  const fieldErrors: AppointmentFormState["fieldErrors"] = {};
  if (!payload.customer_id) fieldErrors.customer_id = "必選";
  if (!payload.scheduled_at) fieldErrors.scheduled_at = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_appointments")
    .update(payload)
    .eq("id", id);
  if (error) return mapDbError(error);

  revalidatePath("/admin/master-data/appointments");
  revalidatePath(`/admin/master-data/appointments/${id}`);
  redirect("/admin/master-data/appointments");
}

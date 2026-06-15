"use server";

/**
 * Server actions — aftersales appointments
 *
 * Result<T> pattern（不 redirect）— UI 自控導航。
 * Spec：docs/proposals/feature-aftersales-appointments.md
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/aftersales/appointments";

export type AppointmentInput = {
  appointment_date: string; // YYYY-MM-DD
  appointment_time: string; // HH:MM
  customer_id?: string | null;
  vehicle_id?: string | null;
  service_type: string;
  service_subtype?: string | null;
  estimated_hours?: number | null;
  assigned_technician_id?: string | null;
  status?: string;
  notes?: string | null;
  source?: string | null; // 寫到 metadata
};

function buildMetadataPatch(
  input: Partial<AppointmentInput>,
  current: Record<string, unknown> = {},
): Record<string, unknown> {
  const meta = { ...current };
  if (input.source !== undefined) {
    if (input.source === null || input.source === "") delete meta.source;
    else meta.source = input.source;
  }
  return meta;
}

function normalizeTime(t: string): string {
  // accept "HH:MM" or "HH:MM:SS"
  if (!t) return t;
  if (t.length === 5) return `${t}:00`;
  return t;
}

export async function createAppointmentAction(
  input: AppointmentInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.APPOINTMENT_EDIT);
  if (!input.appointment_date) return { ok: false, error: "預約日期必填" };
  if (!input.appointment_time) return { ok: false, error: "預約時段必填" };
  if (!input.service_type) return { ok: false, error: "業務類型必填" };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const brand = scope.brand_id;
  const metadata = buildMetadataPatch(input);

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      brand_id: brand,
      subsidiary_id: scope.subsidiary_id,
      appointment_date: input.appointment_date,
      appointment_time: normalizeTime(input.appointment_time),
      customer_id: input.customer_id || null,
      vehicle_id: input.vehicle_id || null,
      service_type: input.service_type,
      service_subtype: input.service_subtype || null,
      estimated_hours: input.estimated_hours ?? null,
      assigned_technician_id: input.assigned_technician_id || null,
      status: input.status || "待到廠",
      notes: input.notes?.trim() || null,
      metadata,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: `建立失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateAppointmentAction(
  id: string,
  patch: Partial<AppointmentInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.APPOINTMENT_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 讀現有 metadata 才能合併
  const { data: existing, error: getErr } = await supabase
    .from("appointments")
    .select("metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (getErr) return { ok: false, error: `讀取失敗：${getErr.message}` };
  if (!existing) return { ok: false, error: "找不到該預約" };

  const upd: Record<string, unknown> = {};
  if (patch.appointment_date !== undefined) upd.appointment_date = patch.appointment_date;
  if (patch.appointment_time !== undefined)
    upd.appointment_time = normalizeTime(patch.appointment_time);
  if (patch.customer_id !== undefined) upd.customer_id = patch.customer_id || null;
  if (patch.vehicle_id !== undefined) upd.vehicle_id = patch.vehicle_id || null;
  if (patch.service_type !== undefined) upd.service_type = patch.service_type;
  if (patch.service_subtype !== undefined) upd.service_subtype = patch.service_subtype || null;
  if (patch.estimated_hours !== undefined) upd.estimated_hours = patch.estimated_hours ?? null;
  if (patch.assigned_technician_id !== undefined)
    upd.assigned_technician_id = patch.assigned_technician_id || null;
  if (patch.status !== undefined) upd.status = patch.status;
  if (patch.notes !== undefined) upd.notes = patch.notes?.trim() || null;
  if (patch.source !== undefined) {
    upd.metadata = buildMetadataPatch(patch, (existing.metadata ?? {}) as Record<string, unknown>);
  }

  const { error } = await supabase
    .from("appointments")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id } };
}

export async function setAppointmentStatusAction(
  id: string,
  status: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.APPOINTMENT_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  if (!status) return { ok: false, error: "缺少狀態" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const upd: Record<string, unknown> = { status };
  const now = new Date().toISOString();
  if (status === "已到廠") upd.arrived_at = now;
  if (status === "維修中") upd.started_at = now;
  if (status === "已完成") upd.completed_at = now;

  const { error } = await supabase
    .from("appointments")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id } };
}

export async function cancelAppointmentAction(
  id: string,
  reason?: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.APPOINTMENT_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: existing, error: getErr } = await supabase
    .from("appointments")
    .select("metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (getErr) return { ok: false, error: `讀取失敗：${getErr.message}` };
  if (!existing) return { ok: false, error: "找不到該預約" };

  const meta = (existing.metadata ?? {}) as Record<string, unknown>;
  if (reason && reason.trim()) meta.cancel_reason = reason.trim();
  meta.canceled_at = new Date().toISOString();

  const { error } = await supabase
    .from("appointments")
    .update({ status: "已取消", metadata: meta })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `取消失敗：${error.message}` };

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteAppointmentAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.APPOINTMENT_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

/**
 * Walk-in 車牌查詢（server action 包裝，讓 client component 可呼叫）。
 * 回傳 found / vehicle / customer；查無時 found=false。
 */
export type WalkInLookupResult = {
  found: boolean;
  vehicle_id: string | null;
  customer_id: string | null;
  vehicle_model_name: string | null;
  customer_name: string | null;
};

export async function lookupVehicleForWalkInAction(
  plate: string,
): Promise<ActionResult<WalkInLookupResult>> {
  // 無需 APPOINTMENT_EDIT 權限——只是查詢
  await requirePermission(PERMISSIONS.APPOINTMENT_VIEW);
  if (!plate.trim()) return { ok: false, error: "請輸入車牌" };

  const { lookupVehicleByPlateForAppointment } = await import("@/domain/appointments");
  const result = await lookupVehicleByPlateForAppointment(plate.trim());

  return {
    ok: true,
    data: {
      found: result.found,
      vehicle_id: result.vehicle?.id ?? null,
      customer_id: result.customer?.id ?? null,
      vehicle_model_name: result.vehicle?.model_name ?? null,
      customer_name: result.customer?.name ?? null,
    },
  };
}

/**
 * Walk-in 臨時插單：建立一筆當日、來源為「Walk-in」的預約，
 * 狀態直接設為「已到廠」（已在廠內）。
 * 成功後前端 router.push 到預檢單新建頁帶 appointment_id。
 */
export async function createWalkInAppointmentAction(input: {
  plate: string;
  customer_id?: string | null;
  vehicle_id?: string | null;
  service_type?: string;
}): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.APPOINTMENT_EDIT);
  if (!input.plate.trim()) return { ok: false, error: "車牌不可為空" };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const brand = scope.brand_id;

  // 取台北當日日期
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const today = `${tz.getFullYear()}-${String(tz.getMonth() + 1).padStart(2, "0")}-${String(tz.getDate()).padStart(2, "0")}`;
  // 當下時間（HH:MM:00）
  const nowTime = `${String(tz.getHours()).padStart(2, "0")}:${String(tz.getMinutes()).padStart(2, "0")}:00`;

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      brand_id: brand,
      subsidiary_id: scope.subsidiary_id,
      appointment_date: today,
      appointment_time: nowTime,
      customer_id: input.customer_id ?? null,
      vehicle_id: input.vehicle_id ?? null,
      service_type: input.service_type ?? "OT",
      status: "已到廠",
      notes: `Walk-in 臨時插單 — 車牌：${input.plate.trim()}`,
      arrived_at: new Date().toISOString(),
      metadata: { source: "walk-in", plate_hint: input.plate.trim() },
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: `建立失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id as string } };
}

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

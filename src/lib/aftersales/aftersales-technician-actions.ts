"use server";

/**
 * Server actions — aftersales_technicians（派工看板）
 *
 * Spec：07_售後管理模組_v2.html → 派工看板
 *  - createTechnicianAction：新增技師
 *  - updateTechnicianAction：改 name / grade / avatar_color / sort_order
 *  - dispatchToTechnicianAction：派工（帶 RO + item + bay）→ status='working' + started_at=now
 *  - completeTechnicianJobAction：完工 → status='idle' + jobs_done +1 + actual_minutes += elapsed
 *  - setTechnicianStatusAction：手動切 status (working / idle / break / off)
 *  - setTechnicianActiveAction：is_active toggle
 *  - deleteTechnicianAction
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { TechStatus } from "@/domain/aftersales-technicians.constants";
import {
  createTechnicianFromEmployee,
  bindTechnicianUser,
  type CreateTechnicianFromEmployeeInput,
} from "@/domain/aftersales-technicians";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE = "/parts/aftersales/management/dispatch";

/* ──────── Create ──────── */

export type CreateTechnicianInput = {
  code: string;
  name: string;
  grade?: string | null;
  avatar_color?: string | null;
  sort_order?: number;
};

export async function createTechnicianAction(
  input: CreateTechnicianInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const code = (input.code ?? "").trim();
  const name = (input.name ?? "").trim();
  if (!code) return { ok: false, error: "技師代碼不可為空" };
  if (!name) return { ok: false, error: "技師姓名不可為空" };

  const scope = await getActiveScope();
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, subsidiary_id")
    .eq("brand_id", scope.brand_id)
    .eq("level", 2)
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("aftersales_technicians")
    .insert({
      brand_id: scope.brand_id,
      organization_id: org?.id ?? null,
      subsidiary_id: org?.subsidiary_id ?? null,
      code,
      name,
      grade: input.grade ?? "車間技師",
      avatar_color: input.avatar_color ?? "#185FA5",
      status: "idle",
      sort_order: input.sort_order ?? 0,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "此技師代碼已存在" };
    return { ok: false, error: error.message };
  }
  revalidatePath(PAGE);
  return { ok: true, data: { id: data.id } };
}

/* ──────── Update ──────── */

export type UpdateTechnicianInput = {
  name?: string;
  grade?: string | null;
  avatar_color?: string | null;
  sort_order?: number;
};

export async function updateTechnicianAction(
  id: string,
  patch: UpdateTechnicianInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const supabase = await createClient();
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) next.name = patch.name.trim();
  if (patch.grade !== undefined) next.grade = patch.grade;
  if (patch.avatar_color !== undefined) next.avatar_color = patch.avatar_color;
  if (patch.sort_order !== undefined) next.sort_order = patch.sort_order;
  const { error } = await supabase
    .from("aftersales_technicians")
    .update(next)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

/* ──────── 派工 / 完工 / 切狀態 ──────── */

export type DispatchToTechnicianInput = {
  ro_code: string;
  item: string;
  bay_code?: string | null;
};

export async function dispatchToTechnicianAction(
  id: string,
  input: DispatchToTechnicianInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const ro = (input.ro_code ?? "").trim();
  const it = (input.item ?? "").trim();
  if (!ro) return { ok: false, error: "RO 編號不可為空" };
  if (!it) return { ok: false, error: "施工項目不可為空" };
  const supabase = await createClient();

  // 取現有 jobs_total 加 1
  const { data: row } = await supabase
    .from("aftersales_technicians")
    .select("jobs_total, status")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, error: "找不到該技師" };
  if (row.status === "off") {
    return { ok: false, error: "技師處於下班狀態，無法派工" };
  }

  const { error } = await supabase
    .from("aftersales_technicians")
    .update({
      status: "working",
      current_ro_code: ro,
      current_item: it,
      current_bay_code: input.bay_code ?? null,
      started_at: new Date().toISOString(),
      jobs_total: (row.jobs_total ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  // 順便 revalidate 工位看板
  revalidatePath("/parts/aftersales/management/bays");
  return { ok: true, data: { id } };
}

export async function completeTechnicianJobAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("aftersales_technicians")
    .select("started_at, actual_minutes, jobs_done")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, error: "找不到該技師" };
  const elapsed = row.started_at
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(row.started_at).getTime()) / 60000,
        ),
      )
    : 0;
  const { error } = await supabase
    .from("aftersales_technicians")
    .update({
      status: "idle",
      current_ro_code: null,
      current_item: null,
      current_bay_code: null,
      started_at: null,
      jobs_done: (row.jobs_done ?? 0) + 1,
      actual_minutes: (row.actual_minutes ?? 0) + elapsed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  revalidatePath("/parts/aftersales/management/bays");
  return { ok: true, data: { id } };
}

export async function setTechnicianStatusAction(
  id: string,
  status: TechStatus,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const supabase = await createClient();
  const next: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "idle" || status === "break" || status === "off") {
    next.current_ro_code = null;
    next.current_item = null;
    next.current_bay_code = null;
    next.started_at = null;
  }
  const { error } = await supabase
    .from("aftersales_technicians")
    .update(next)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

/**
 * 包E：技師缺席重排 —— 把缺席技師當前在修的工單移交另一技師（或留空），來源技師標下班(off)。
 *  - toTechnicianId=null：僅把來源標缺席、清當前工單（工單回未指派狀態）
 *  - 否則：當前工單(current_ro_code/item/bay)轉給目標技師（目標 → working、jobs_total+1）
 */
export async function reassignTechnicianCurrentJobAction(
  fromTechnicianId: string,
  toTechnicianId: string | null,
): Promise<ActionResult<{ moved: boolean }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  if (!fromTechnicianId) return { ok: false, error: "缺少來源技師" };
  if (toTechnicianId && toTechnicianId === fromTechnicianId)
    return { ok: false, error: "來源與目標技師相同" };

  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: from, error: fromErr } = await supabase
    .from("aftersales_technicians")
    .select("id, current_ro_code, current_item, current_bay_code")
    .eq("id", fromTechnicianId)
    .maybeSingle();
  if (fromErr) return { ok: false, error: fromErr.message };
  if (!from) return { ok: false, error: "找不到來源技師" };

  const job = {
    current_ro_code: (from as { current_ro_code: string | null }).current_ro_code,
    current_item: (from as { current_item: string | null }).current_item,
    current_bay_code: (from as { current_bay_code: string | null }).current_bay_code,
  };
  const hasJob = !!job.current_ro_code;

  if (toTechnicianId && hasJob) {
    const { data: to, error: toErr } = await supabase
      .from("aftersales_technicians")
      .select("id, is_active, jobs_total")
      .eq("id", toTechnicianId)
      .maybeSingle();
    if (toErr) return { ok: false, error: toErr.message };
    if (!to || !(to as { is_active: boolean }).is_active)
      return { ok: false, error: "目標技師不存在或未啟用" };
    const { error: assignErr } = await supabase
      .from("aftersales_technicians")
      .update({
        status: "working",
        current_ro_code: job.current_ro_code,
        current_item: job.current_item,
        current_bay_code: job.current_bay_code,
        started_at: now,
        jobs_total: ((to as { jobs_total: number }).jobs_total ?? 0) + 1,
        updated_at: now,
      })
      .eq("id", toTechnicianId);
    if (assignErr) return { ok: false, error: `轉派失敗：${assignErr.message}` };
  }

  // 來源技師標缺席（下班）+ 清當前工單
  const { error: offErr } = await supabase
    .from("aftersales_technicians")
    .update({
      status: "off",
      current_ro_code: null,
      current_item: null,
      current_bay_code: null,
      started_at: null,
      updated_at: now,
    })
    .eq("id", fromTechnicianId);
  if (offErr) return { ok: false, error: offErr.message };

  revalidatePath(PAGE);
  return { ok: true, data: { moved: !!(toTechnicianId && hasJob) } };
}

/* ──────── Active toggle / Delete ──────── */

export async function setTechnicianActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const supabase = await createClient();
  const next: Record<string, unknown> = {
    is_active: active,
    status: active ? "idle" : "off",
    updated_at: new Date().toISOString(),
  };
  if (!active) {
    next.current_ro_code = null;
    next.current_item = null;
    next.current_bay_code = null;
    next.started_at = null;
  }
  const { error } = await supabase
    .from("aftersales_technicians")
    .update(next)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export async function deleteTechnicianAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const supabase = await createClient();
  const { error } = await supabase
    .from("aftersales_technicians")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export async function checkDispatchEditPermission(): Promise<boolean> {
  return await hasPermission(PERMISSIONS.RO_DISPATCH);
}

// ── 第14輪：員工/技師串接 ──

export async function createTechnicianFromEmployeeAction(
  input: CreateTechnicianFromEmployeeInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const res = await createTechnicianFromEmployee(input);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath(PAGE);
  return { ok: true, data: res.data };
}

export async function bindTechnicianUserAction(
  technician_id: string,
  user_id: string | null,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const res = await bindTechnicianUser(technician_id, user_id);
  if (!res.ok) return { ok: false, error: res.error ?? "綁定帳號失敗" };
  revalidatePath(PAGE);
  return { ok: true, data: { id: technician_id } };
}

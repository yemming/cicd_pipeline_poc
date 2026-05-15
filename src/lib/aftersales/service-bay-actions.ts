"use server";

/**
 * Server actions — service_bays（工位看板）
 *
 * Spec：07_售後管理模組_v2.html
 *  - createBayAction：新增工位
 *  - updateBayAction：改 name / type / purpose / sort_order
 *  - setBayStatusAction：手動切 status (free / busy / urgent / offline)
 *  - assignBayAction：派工（同時帶 RO + tech）→ status='busy' + started_at=now
 *  - completeBayAction：完工 → status='free' + done_today += 1 + used_minutes += elapsed
 *  - setBayActiveAction：is_active toggle
 *  - deleteBayAction
 *  - setShopDailyHoursAction
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { BayStatus, BayType } from "@/domain/service-bays.constants";
import { setShopDailyHours } from "@/domain/service-bays";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE = "/parts/aftersales/management/bays";

export type CreateBayInput = {
  code: string;
  name: string;
  bay_type?: BayType | string | null;
  purpose?: string | null;
  sort_order?: number;
};

export async function createBayAction(
  input: CreateBayInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const code = (input.code ?? "").trim();
  const name = (input.name ?? "").trim();
  if (!code) return { ok: false, error: "工位代碼不可為空" };
  if (!name) return { ok: false, error: "工位名稱不可為空" };

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
    .from("service_bays")
    .insert({
      brand_id: scope.brand_id,
      organization_id: org?.id ?? null,
      subsidiary_id: org?.subsidiary_id ?? null,
      code,
      name,
      bay_type: input.bay_type ?? null,
      purpose: input.purpose ?? null,
      status: "free",
      sort_order: input.sort_order ?? 0,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "此工位代碼已存在" };
    return { ok: false, error: error.message };
  }
  revalidatePath(PAGE);
  return { ok: true, data: { id: data.id } };
}

export type UpdateBayInput = {
  name?: string;
  bay_type?: BayType | string | null;
  purpose?: string | null;
  sort_order?: number;
};

export async function updateBayAction(
  id: string,
  patch: UpdateBayInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const supabase = await createClient();
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) next.name = patch.name.trim();
  if (patch.bay_type !== undefined) next.bay_type = patch.bay_type;
  if (patch.purpose !== undefined) next.purpose = patch.purpose;
  if (patch.sort_order !== undefined) next.sort_order = patch.sort_order;
  const { error } = await supabase.from("service_bays").update(next).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export async function setBayStatusAction(
  id: string,
  status: BayStatus,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const supabase = await createClient();
  const next: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "free" || status === "offline") {
    next.current_ro_code = null;
    next.current_item = null;
    next.current_tech_name = null;
    next.current_tech_color = null;
    next.started_at = null;
  }
  const { error } = await supabase.from("service_bays").update(next).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export type AssignBayInput = {
  ro_code: string;
  item: string;
  tech_name: string;
  tech_color?: string;
};

export async function assignBayAction(
  id: string,
  input: AssignBayInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const ro = (input.ro_code ?? "").trim();
  const it = (input.item ?? "").trim();
  const tech = (input.tech_name ?? "").trim();
  if (!ro) return { ok: false, error: "RO 編號不可為空" };
  if (!it) return { ok: false, error: "施工項目不可為空" };
  if (!tech) return { ok: false, error: "請選擇技師" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("service_bays")
    .update({
      status: "busy",
      current_ro_code: ro,
      current_item: it,
      current_tech_name: tech,
      current_tech_color: input.tech_color ?? "#185FA5",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export async function completeBayAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("service_bays")
    .select("started_at, used_minutes, done_today")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, error: "找不到該工位" };
  const elapsed = row.started_at
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(row.started_at).getTime()) / 60000),
      )
    : 0;
  const { error } = await supabase
    .from("service_bays")
    .update({
      status: "free",
      current_ro_code: null,
      current_item: null,
      current_tech_name: null,
      current_tech_color: null,
      started_at: null,
      done_today: (row.done_today ?? 0) + 1,
      used_minutes: (row.used_minutes ?? 0) + elapsed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export async function setBayActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const supabase = await createClient();
  const next: Record<string, unknown> = {
    is_active: active,
    status: active ? "free" : "offline",
    updated_at: new Date().toISOString(),
  };
  if (!active) {
    next.current_ro_code = null;
    next.current_item = null;
    next.current_tech_name = null;
    next.current_tech_color = null;
    next.started_at = null;
  }
  const { error } = await supabase.from("service_bays").update(next).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export async function deleteBayAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const supabase = await createClient();
  const { error } = await supabase.from("service_bays").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export async function setShopDailyHoursAction(
  hours: number,
): Promise<ActionResult<{ hours: number }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const res = await setShopDailyHours(hours);
  if (!res.ok) return { ok: false, error: res.error ?? "設定失敗" };
  revalidatePath(PAGE);
  return { ok: true, data: { hours } };
}

export async function checkBaysEditPermission(): Promise<boolean> {
  return await hasPermission(PERMISSIONS.RO_DISPATCH);
}

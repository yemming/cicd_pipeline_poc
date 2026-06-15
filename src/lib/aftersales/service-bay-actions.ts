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

/**
 * completeBayAndAdvanceRoAction
 *
 * 工位完工閉環：
 *   1. 工位 status → 'free'，累加 done_today / used_minutes（同 completeBayAction）
 *   2. 用 current_ro_code 查詢對應 repair_order.id
 *   3. 若 RO 目前 status = '維修中'，推進至「待結帳」（等待竣工複檢語意）
 *
 * 對應設計稿：07_售後管理模組_v3.html clockDone()
 */
export async function completeBayAndAdvanceRoAction(
  bayId: string,
): Promise<ActionResult<{ id: string; roAdvanced: boolean; completedAt: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const supabase = await createClient();

  // ── 1. 讀工位現況 ──
  const { data: bay } = await supabase
    .from("service_bays")
    .select("started_at, used_minutes, done_today, current_ro_code")
    .eq("id", bayId)
    .maybeSingle();
  if (!bay) return { ok: false, error: "找不到該工位" };

  const elapsed = bay.started_at
    ? Math.max(0, Math.floor((Date.now() - new Date(bay.started_at).getTime()) / 60000))
    : 0;

  // ── 2. 工位完工（status → free，清空欄位） ──
  const completedAt = new Date().toISOString();
  const { error: bayErr } = await supabase
    .from("service_bays")
    .update({
      status: "free",
      current_ro_code: null,
      current_item: null,
      current_tech_name: null,
      current_tech_color: null,
      started_at: null,
      done_today: (bay.done_today ?? 0) + 1,
      used_minutes: (bay.used_minutes ?? 0) + elapsed,
      updated_at: completedAt,
    })
    .eq("id", bayId);
  if (bayErr) return { ok: false, error: bayErr.message };

  // ── 3. 嘗試推進 RO 狀態（非阻塞，失敗不 rollback 工位完工）──
  let roAdvanced = false;
  const roCode = (bay.current_ro_code ?? "").trim();
  if (roCode) {
    const scope = await getActiveScope();
    const { data: ro } = await supabase
      .from("repair_orders")
      .select("id, status")
      .eq("brand_id", scope.brand_id)
      .eq("ro_code", roCode)
      .maybeSingle();

    // 只有「維修中」才推進（防止雙重觸發）
    if (ro && ro.status === "維修中") {
      const { error: roErr } = await supabase
        .from("repair_orders")
        .update({ status: "待結帳", updated_at: completedAt })
        .eq("id", ro.id);

      if (!roErr) {
        // 附加狀態歷程紀錄（非阻塞，失敗不影響主流程）
        await supabase.from("repair_order_status_history").insert({
          ro_id: ro.id,
          brand_id: scope.brand_id,
          from_status: "維修中",
          to_status: "待結帳",
          actor_id: null,
          reason: `工位 ${roCode} 完工交棒（自動推進）`,
          changed_at: completedAt,
        });
        roAdvanced = true;
      }
    }
  }

  revalidatePath(PAGE);
  return { ok: true, data: { id: bayId, roAdvanced, completedAt } };
}

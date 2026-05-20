"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/setup/compatibility";

export type CompatInput = {
  item_id: string;
  vehicle_model_id: string;
  year_start?: number | null;
  year_end?: number | null;
  notes?: string | null;
  is_verified?: boolean;
};

function normalizeYears(
  year_start: number | null | undefined,
  year_end: number | null | undefined,
): { year_start: number | null; year_end: number | null; error?: string } {
  const s = year_start == null || Number.isNaN(year_start) ? null : Math.trunc(year_start);
  const e = year_end == null || Number.isNaN(year_end) ? null : Math.trunc(year_end);
  if (s != null && (s < 1900 || s > 2100)) return { year_start: s, year_end: e, error: "起始年份需介於 1900–2100" };
  if (e != null && (e < 1900 || e > 2100)) return { year_start: s, year_end: e, error: "結束年份需介於 1900–2100" };
  if (s != null && e != null && s > e) return { year_start: s, year_end: e, error: "起始年份不可大於結束年份" };
  return { year_start: s, year_end: e };
}

export async function createCompatAction(
  input: CompatInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!input.item_id) return { ok: false, error: "請選擇備件" };
  if (!input.vehicle_model_id) return { ok: false, error: "請選擇車型" };
  const yr = normalizeYears(input.year_start, input.year_end);
  if (yr.error) return { ok: false, error: yr.error };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("item_vehicle_compatibility")
    .insert({
      brand_id: brand,
      item_id: input.item_id,
      vehicle_model_id: input.vehicle_model_id,
      year_start: yr.year_start,
      year_end: yr.year_end,
      notes: input.notes?.trim() || null,
      is_verified: input.is_verified ?? false,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "此適配組合已存在（備件 × 車型 × 年份相同）" };
    return { ok: false, error: `建立失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateCompatAction(
  id: string,
  patch: Partial<CompatInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const upd: Record<string, unknown> = {};
  if (patch.item_id !== undefined) {
    if (!patch.item_id) return { ok: false, error: "備件不可為空" };
    upd.item_id = patch.item_id;
  }
  if (patch.vehicle_model_id !== undefined) {
    if (!patch.vehicle_model_id) return { ok: false, error: "車型不可為空" };
    upd.vehicle_model_id = patch.vehicle_model_id;
  }
  if (patch.year_start !== undefined || patch.year_end !== undefined) {
    const yr = normalizeYears(patch.year_start, patch.year_end);
    if (yr.error) return { ok: false, error: yr.error };
    if (patch.year_start !== undefined) upd.year_start = yr.year_start;
    if (patch.year_end !== undefined) upd.year_end = yr.year_end;
  }
  if (patch.notes !== undefined) upd.notes = patch.notes?.trim() || null;
  if (patch.is_verified !== undefined) upd.is_verified = patch.is_verified;

  if (Object.keys(upd).length === 0) return { ok: true, data: { id } };

  const { error } = await supabase
    .from("item_vehicle_compatibility")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "此適配組合已存在（備件 × 車型 × 年份相同）" };
    return { ok: false, error: `儲存失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function toggleVerifiedAction(
  id: string,
  is_verified: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("item_vehicle_compatibility")
    .update({ is_verified })
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function deleteCompatAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("item_vehicle_compatibility")
    .delete()
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

// ============================================================================
// P1-5 bulk apply：矩陣模式批次套用適配
// ============================================================================

export type BulkApplyInput = {
  item_ids: string[];
  vehicle_model_ids: string[];
  year_start: number | null;
  year_end: number | null;
  notes: string | null;
};

export async function bulkApplyCompatibilityAction(
  input: BulkApplyInput,
): Promise<ActionResult<{ inserted: number; updated: number; skipped: number }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!input.item_ids?.length) return { ok: false, error: "請選擇至少一個備件" };
  if (!input.vehicle_model_ids?.length) return { ok: false, error: "請選擇至少一個車型" };

  const yr = normalizeYears(input.year_start, input.year_end);
  if (yr.error) return { ok: false, error: yr.error };

  const total = input.item_ids.length * input.vehicle_model_ids.length;
  if (total > 500) return { ok: false, error: `批次上限 500 組，目前 ${total} 組` };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 讀現有 row 判斷新增/更新
  const { data: existing, error: qErr } = await supabase
    .from("item_vehicle_compatibility")
    .select("id, item_id, vehicle_model_id")
    .eq("brand_id", brand)
    .in("item_id", input.item_ids)
    .in("vehicle_model_id", input.vehicle_model_ids);
  if (qErr) return { ok: false, error: `查詢失敗：${qErr.message}` };

  const existMap = new Map<string, string>();
  for (const r of existing ?? []) {
    existMap.set(`${r.item_id}|${r.vehicle_model_id}`, r.id);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const notes = input.notes?.trim() || null;

  for (const itemId of input.item_ids) {
    for (const modelId of input.vehicle_model_ids) {
      const existingId = existMap.get(`${itemId}|${modelId}`);
      if (existingId) {
        const { error } = await supabase
          .from("item_vehicle_compatibility")
          .update({
            year_start: yr.year_start,
            year_end: yr.year_end,
            notes,
          })
          .eq("id", existingId);
        if (error) {
          skipped++;
          continue;
        }
        updated++;
      } else {
        const { error } = await supabase.from("item_vehicle_compatibility").insert({
          brand_id: brand,
          item_id: itemId,
          vehicle_model_id: modelId,
          year_start: yr.year_start,
          year_end: yr.year_end,
          notes,
          is_verified: false,
        });
        if (error) {
          skipped++;
          continue;
        }
        inserted++;
      }
    }
  }

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { inserted, updated, skipped } };
}

"use server";

import { revalidatePath } from "next/cache";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/setup/compatibility";

export type CompatInput = {
  item_id: string;
  motorcycle_model_id: string;
  year_start?: number | null;
  year_end?: number | null;
  notes?: string;
  is_verified?: boolean;
};

export async function createCompatAction(
  input: CompatInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!input.item_id) return { ok: false, error: "料號必選" };
  if (!input.motorcycle_model_id) return { ok: false, error: "車型必選" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_motorcycle_compatibility")
    .insert({
      brand_id: getBrandKey(),
      item_id: input.item_id,
      motorcycle_model_id: input.motorcycle_model_id,
      year_start: input.year_start ?? null,
      year_end: input.year_end ?? null,
      notes: input.notes?.trim() || null,
      is_verified: input.is_verified ?? false,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `建立失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function toggleVerifiedAction(
  id: string,
  is_verified: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("item_motorcycle_compatibility")
    .update({ is_verified })
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: `更新失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function deleteCompatAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("item_motorcycle_compatibility")
    .delete()
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

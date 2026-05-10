"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/warranty/used-parts-flow";

export async function updateUsedPartsConfigAction(
  patch: Record<string, unknown>,
): Promise<ActionResult<{ brand_id: string }>> {
  await requirePermission(PERMISSIONS.USEDPART_OPS);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("parts_warranty_used_parts_config")
    .update(patch)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { brand_id: brand } };
}

export async function setUsedPartItemStatusAction(
  id: string,
  status: string,
  status_label: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.USEDPART_OPS);
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_warranty_used_parts_items")
    .update({ status, status_label })
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

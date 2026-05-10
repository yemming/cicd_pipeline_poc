"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
export type ItemLeadTimeUpdateResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateItemLeadTime(
  itemId: string,
  leadTimeDays: number | null,
): Promise<ItemLeadTimeUpdateResult> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!itemId) return { ok: false, error: "缺少 item id" };
  if (leadTimeDays !== null && (!Number.isFinite(leadTimeDays) || leadTimeDays < 0)) {
    return { ok: false, error: "前置天數必須為 0 或正整數" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ default_lead_time_days: leadTimeDays })
    .eq("id", itemId)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/master-data/item-lead-times");
  return { ok: true };
}

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

export type ItemLeadTimeDetailInput = {
  default_lead_time_days: number | null;
  default_supplier_id: string | null;
};

/**
 * Detail 頁編輯模式儲存：同時更新 MRP 前置時間 + 預設供應商。
 */
export async function updateItemLeadTimeDetail(
  itemId: string,
  input: ItemLeadTimeDetailInput,
): Promise<ItemLeadTimeUpdateResult> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!itemId) return { ok: false, error: "缺少 item id" };
  const { default_lead_time_days: days, default_supplier_id } = input;
  if (days !== null && (!Number.isInteger(days) || days < 0)) {
    return { ok: false, error: "前置天數必須為 0 或正整數" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({
      default_lead_time_days: days,
      default_supplier_id: default_supplier_id || null,
    })
    .eq("id", itemId)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/master-data/item-lead-times");
  revalidatePath(`/admin/master-data/item-lead-times/${itemId}`);
  return { ok: true };
}

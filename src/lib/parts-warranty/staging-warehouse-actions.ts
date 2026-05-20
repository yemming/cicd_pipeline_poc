"use server";

/**
 * Server Actions — Parts Warranty Staging Warehouse (M04L-11)
 *
 * 控制 warehouses.is_warranty_staging flag 的切換。
 * Result<T> 風格，不 redirect，client 自己決定 banner / refresh。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/warranty/staging-warehouse";

/**
 * 切換倉庫的「保固暫存倉」狀態。
 *
 * 前端要在按下前先 check 該倉目前 stored_count，>0 時跳 confirm modal。
 * 後端只負責切 flag、不擋（避免 race condition 出怪錯）。
 */
export async function setWarrantyStaging(
  warehouseId: string,
  value: boolean,
): Promise<ActionResult<{ id: string; is_warranty_staging: boolean }>> {
  await requirePermission(PERMISSIONS.WAREHOUSE_EDIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  if (!warehouseId) {
    return { ok: false, error: "缺少倉庫 ID" };
  }

  const { data, error } = await supabase
    .from("warehouses")
    .update({ is_warranty_staging: value })
    .eq("id", warehouseId)
    .eq("brand_id", brand)
    .select("id, is_warranty_staging")
    .maybeSingle();

  if (error) {
    return { ok: false, error: `切換失敗：${error.message}` };
  }
  if (!data) {
    return { ok: false, error: "找不到此倉庫或無權限存取" };
  }

  revalidatePath(PAGE_PATH);
  return {
    ok: true,
    data: { id: data.id, is_warranty_staging: data.is_warranty_staging },
  };
}

"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type GlField = "inventory" | "cogs" | "revenue";

const FIELD_TO_COLUMN: Record<GlField, string> = {
  inventory: "gl_inventory_coa_id",
  cogs: "gl_cogs_coa_id",
  revenue: "gl_revenue_coa_id",
};

export async function updateItemGlAccountAction(
  itemId: string,
  field: GlField,
  coaId: string | null,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!itemId) return { ok: false, error: "缺少商品 id" };
  const column = FIELD_TO_COLUMN[field];
  if (!column) return { ok: false, error: "不允許的科目類型" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id")
    .eq("id", itemId)
    .eq("brand_id", brand)
    .single();
  if (itemErr || !item) {
    return { ok: false, error: "找不到該商品（或不在當前品牌）" };
  }

  if (coaId) {
    const { data: coa, error: coaErr } = await supabase
      .from("chart_of_accounts")
      .select("id, is_postable, is_active")
      .eq("id", coaId)
      .single();
    if (coaErr || !coa) return { ok: false, error: "找不到指定科目" };
    if (!coa.is_postable) {
      return {
        ok: false,
        error: "此科目為中分類、無法綁定（請選 leaf-level 可入帳科目）",
      };
    }
    if (!coa.is_active) {
      return { ok: false, error: "此科目已停用、無法綁定" };
    }
  }

  const { error } = await supabase
    .from("items")
    .update({ [column]: coaId })
    .eq("id", itemId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };

  revalidatePath(`/parts/setup/items/${itemId}`);
  revalidatePath(`/parts/setup/items`);
  return { ok: true, data: { id: itemId } };
}

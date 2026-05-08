"use server";

import { revalidatePath } from "next/cache";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/setup/items";

export type ItemInput = {
  code: string;
  name: string;
  category?: string;
  control_type?: string;
  base_uom?: string;
  standard_cost?: number | null;
  suggested_price?: number | null;
  warranty_months?: number | null;
  shelf_life_months?: number | null;
  default_supplier_id?: string | null;
  is_active?: boolean;
};

export async function createItemAction(
  input: ItemInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!input.code?.trim()) return { ok: false, error: "料號必填" };
  if (!input.name?.trim()) return { ok: false, error: "名稱必填" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .insert({
      brand_id: getBrandKey(),
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      category: input.category?.trim() || null,
      control_type: input.control_type?.trim() || null,
      base_uom: input.base_uom?.trim() || "PCS",
      standard_cost: input.standard_cost ?? null,
      suggested_price: input.suggested_price ?? null,
      warranty_months: input.warranty_months ?? null,
      shelf_life_months: input.shelf_life_months ?? null,
      default_supplier_id: input.default_supplier_id || null,
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "此料號已存在" };
    return { ok: false, error: `建立失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateItemAction(
  id: string,
  patch: Partial<ItemInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const upd: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (typeof v === "string") {
      upd[k] = k === "code" ? v.trim().toUpperCase() : v.trim() || null;
    } else {
      upd[k] = v;
    }
  }
  const { error } = await supabase
    .from("items")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function setItemActiveAction(
  id: string,
  is_active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ is_active })
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: `更新失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

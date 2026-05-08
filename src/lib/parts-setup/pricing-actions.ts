"use server";

import { revalidatePath } from "next/cache";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/setup/pricing";

export async function upsertPriceAction(
  input: {
    id?: string;
    item_id: string;
    org_id: string | null;
    price: number;
    pricing_type?: string;
    is_active?: boolean;
    notes?: string;
  },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  const supabase = await createClient();
  const brand = getBrandKey();
  if (input.id) {
    const { error } = await supabase
      .from("item_store_prices")
      .update({
        price: input.price,
        pricing_type: input.pricing_type ?? "list",
        is_active: input.is_active ?? true,
        notes: input.notes?.trim() || null,
      })
      .eq("id", input.id)
      .eq("brand_id", brand);
    if (error) return { ok: false, error: `儲存失敗：${error.message}` };
    revalidatePath(PAGE_PATH);
    return { ok: true, data: { id: input.id } };
  }
  if (!input.item_id) return { ok: false, error: "料號必選" };
  const { data, error } = await supabase
    .from("item_store_prices")
    .insert({
      brand_id: brand,
      item_id: input.item_id,
      org_id: input.org_id,
      price: input.price,
      pricing_type: input.pricing_type ?? "list",
      is_active: input.is_active ?? true,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `建立失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function deletePriceAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("item_store_prices")
    .delete()
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

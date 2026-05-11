"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
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
  const brand = (await getActiveScope()).brand_id;
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
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

/**
 * 切到促銷：只改 pricing_type，保留 price（user 應已 inline edit 把 price 調成促銷價）。
 * DB CHECK constraint：pricing_type ∈ {'default','custom','promotion'}
 */
export async function setPriceAsPromoAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("item_store_prices")
    .update({ pricing_type: "promotion" })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `切換促銷失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

/**
 * 結束促銷：pricing_type 回 'default'，price 自動重設為對應 items.suggested_price。
 * 若該商品沒設 suggested_price，回 ok:false（避免把 price 寫成 NULL 造成 NOT NULL violation）。
 */
export async function endPromoPricingAction(
  id: string,
): Promise<ActionResult<{ id: string; restoredPrice: number }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 1. 撈當前 row 的 item_id，順便驗 brand 範圍
  const { data: row, error: rowErr } = await supabase
    .from("item_store_prices")
    .select("item_id")
    .eq("id", id)
    .eq("brand_id", brand)
    .single();
  if (rowErr || !row) return { ok: false, error: "找不到該定價紀錄" };

  // 2. 撈對應 item 的 suggested_price
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("suggested_price")
    .eq("id", row.item_id)
    .eq("brand_id", brand)
    .single();
  if (itemErr || !item) return { ok: false, error: "找不到對應商品" };
  if (item.suggested_price === null || item.suggested_price === undefined) {
    return {
      ok: false,
      error: "此商品沒設定建議售價、無法自動結束促銷（請先到商品主檔填建議售價）",
    };
  }

  const restored = Number(item.suggested_price);

  // 3. update pricing_type='default' + price=suggested_price
  const { error: updErr } = await supabase
    .from("item_store_prices")
    .update({ pricing_type: "default", price: restored })
    .eq("id", id)
    .eq("brand_id", brand);
  if (updErr) return { ok: false, error: `結束促銷失敗：${updErr.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id, restoredPrice: restored } };
}

/**
 * Inline edit：只改 price，pricing_type / 其他欄位不動。
 */
export async function updatePriceOnlyAction(
  id: string,
  newPrice: number,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    return { ok: false, error: "價格必須是大於 0 的數字" };
  }
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("item_store_prices")
    .update({ price: newPrice })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

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
const ITEMS_PATH = "/parts/setup/items";

/**
 * 翻 Postgres 錯誤碼成人話。Caller 已處理 brand 範圍，這裡只翻常見 violation。
 */
function mapDbError(err: { code?: string; message: string }): string {
  if (err.code === "23505") {
    return "該門店該類型已有定價、不可重複建立（請改用編輯）";
  }
  if (err.code === "23514") {
    return "不允許的定價類型（DB CHECK 拒絕）";
  }
  if (err.code === "23503") {
    return "找不到該商品 / 門店（外鍵失效）";
  }
  return `建立失敗：${err.message}`;
}

/**
 * 為某商品 + 某門店建立一筆 store-level 定價。
 * 用途：pricing 頁 fallback row 第一次 inline edit、或 items detail 銷售 tab 「+ 新增定價」。
 *
 * 預設 pricing_type='custom'（門店微調語意）。DB CHECK pricing_type ∈ {default,custom,promotion}，
 * unique key = (item_id, org_id, pricing_type) — 不能重複建立同 item × org × custom。
 */
export async function createStorePriceAction(input: {
  item_id: string;
  org_id: string;
  price: number;
  pricing_type?: string; // 預設 'custom'
}): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!input.item_id) return { ok: false, error: "缺少商品 id" };
  if (!input.org_id) return { ok: false, error: "缺少門店 id" };
  if (!Number.isFinite(input.price) || input.price <= 0) {
    return { ok: false, error: "價格必須是大於 0 的數字" };
  }
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 防跨 brand 寫入：驗 item 屬該 brand
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id")
    .eq("id", input.item_id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (itemErr) return { ok: false, error: `驗證商品失敗：${itemErr.message}` };
  if (!item) return { ok: false, error: "找不到該商品（不在當前品牌範圍）" };

  // 驗 org 屬該 brand
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", input.org_id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (orgErr) return { ok: false, error: `驗證門店失敗：${orgErr.message}` };
  if (!org) return { ok: false, error: "找不到該門店（不在當前品牌範圍）" };

  const pricing_type = input.pricing_type ?? "custom";
  const { data, error } = await supabase
    .from("item_store_prices")
    .insert({
      brand_id: brand,
      item_id: input.item_id,
      org_id: input.org_id,
      price: input.price,
      pricing_type,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error) };

  revalidatePath(PAGE_PATH);
  // dynamic items detail 都要更新（任何 item 的 detail 都可能在開）
  revalidatePath(ITEMS_PATH, "layout");
  return { ok: true, data: { id: data.id } };
}

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

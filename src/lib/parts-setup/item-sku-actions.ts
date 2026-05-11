"use server";

/**
 * Server actions — item_skus 多維度料號 CRUD
 *
 * 注意：item_skus.sku_type CHECK constraint 只接受
 *   'oem' | 'internal' | 'alternate' | 'barcode' | 'supplier'
 * Phase 2 開放 add / update / delete / set_primary，Items 主檔欄位本 Phase 全鎖。
 *
 * is_primary 規則：每筆 item 同一個 sku_type 之下只允許一筆 is_primary=true。
 * 切 primary 時要把該 (item_id, sku_type) 其他 row 的 is_primary 清掉。
 * （DB 層沒有 partial unique index，這層由 application code 自律。）
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/setup/items-info";

// 注意：DB CHECK constraint 只接受這 5 個值。client 端的選單也要對齊（在 board 重宣告，因為
// "use server" 模組不能 export 非 async 值）。
const ITEM_SKU_TYPES = ["oem", "internal", "alternate", "barcode", "supplier"] as const;
type ItemSkuType = (typeof ITEM_SKU_TYPES)[number];

export type ItemSkuInput = {
  sku_type: string; // 必須是 ITEM_SKU_TYPES 之一
  sku_code: string;
  notes?: string | null;
  is_primary?: boolean;
};

function validateSkuType(t: string): t is ItemSkuType {
  return (ITEM_SKU_TYPES as readonly string[]).includes(t);
}

function mapInsertError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "此維度已存在相同料號（同 brand + sku_type + sku_code 重複）";
  if (error.code === "23514") return "不允許的 SKU 維度（請選擇 OEM / 內部 / 替代 / 條碼 / 供應商）";
  return `寫入失敗：${error.message}`;
}

/**
 * 新增一筆 item_skus
 * - is_primary=true 時，先把同 (item_id, sku_type) 其他 row 的 is_primary 清掉
 */
export async function addItemSkuAction(
  itemId: string,
  input: ItemSkuInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!itemId) return { ok: false, error: "缺少 item_id" };
  if (!input.sku_code?.trim()) return { ok: false, error: "料號 / 條碼必填" };
  if (!validateSkuType(input.sku_type)) {
    return { ok: false, error: "不允許的 SKU 維度" };
  }

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const sku_code = input.sku_code.trim();
  const sku_type = input.sku_type;
  const wantPrimary = !!input.is_primary;

  // 確認 item 屬於本 brand（避免跨 brand 寫入）
  const { data: itemCheck, error: itemErr } = await supabase
    .from("items")
    .select("id")
    .eq("id", itemId)
    .eq("brand_id", brand)
    .single();
  if (itemErr || !itemCheck) return { ok: false, error: "找不到該商品（或不在當前品牌）" };

  if (wantPrimary) {
    const { error: clrErr } = await supabase
      .from("item_skus")
      .update({ is_primary: false })
      .eq("item_id", itemId)
      .eq("brand_id", brand)
      .eq("sku_type", sku_type);
    if (clrErr) return { ok: false, error: `切主要前清舊值失敗：${clrErr.message}` };
  }

  const { data, error } = await supabase
    .from("item_skus")
    .insert({
      brand_id: brand,
      item_id: itemId,
      sku_type,
      sku_code,
      notes: input.notes?.trim() || null,
      is_primary: wantPrimary,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapInsertError(error) };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

/**
 * 更新一筆 item_skus（sku_code / notes / sku_type / is_primary）
 */
export async function updateItemSkuAction(
  skuId: string,
  patch: Partial<ItemSkuInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!skuId) return { ok: false, error: "缺少 sku id" };
  if (patch.sku_type !== undefined && !validateSkuType(patch.sku_type)) {
    return { ok: false, error: "不允許的 SKU 維度" };
  }

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 撈現 row（要驗 brand + 取得 item_id / sku_type 用來處理 is_primary 互斥）
  const { data: existing, error: exErr } = await supabase
    .from("item_skus")
    .select("id, item_id, sku_type, is_primary")
    .eq("id", skuId)
    .eq("brand_id", brand)
    .single();
  if (exErr || !existing) return { ok: false, error: "找不到該料號（或不在當前品牌）" };

  const upd: Record<string, unknown> = {};
  if (patch.sku_code !== undefined) {
    const v = patch.sku_code.trim();
    if (!v) return { ok: false, error: "料號 / 條碼不可為空" };
    upd.sku_code = v;
  }
  if (patch.notes !== undefined) {
    upd.notes = patch.notes?.trim() || null;
  }
  if (patch.sku_type !== undefined) {
    upd.sku_type = patch.sku_type;
  }
  if (patch.is_primary !== undefined) {
    upd.is_primary = patch.is_primary;
  }

  if (Object.keys(upd).length === 0) {
    return { ok: true, data: { id: skuId } };
  }

  // 若把這筆設為 primary、要先清同 (item_id, sku_type) 其他 row（用最終的 sku_type）
  if (upd.is_primary === true) {
    const finalType = (upd.sku_type as string | undefined) ?? existing.sku_type;
    const { error: clrErr } = await supabase
      .from("item_skus")
      .update({ is_primary: false })
      .eq("item_id", existing.item_id)
      .eq("brand_id", brand)
      .eq("sku_type", finalType)
      .neq("id", skuId);
    if (clrErr) return { ok: false, error: `切主要前清舊值失敗：${clrErr.message}` };
  }

  const { error } = await supabase
    .from("item_skus")
    .update(upd)
    .eq("id", skuId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapInsertError(error) };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: skuId } };
}

/**
 * 刪除一筆 item_skus
 */
export async function deleteItemSkuAction(
  skuId: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!skuId) return { ok: false, error: "缺少 sku id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("item_skus")
    .delete()
    .eq("id", skuId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: skuId } };
}

/**
 * 把指定 sku 設為該 (item, sku_type) 的主要 — 把同 (item_id, sku_type) 其他 row 的 is_primary 清掉
 */
export async function setPrimaryItemSkuAction(
  itemId: string,
  skuId: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!itemId || !skuId) return { ok: false, error: "缺少 item_id 或 sku id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: target, error: tErr } = await supabase
    .from("item_skus")
    .select("id, item_id, sku_type")
    .eq("id", skuId)
    .eq("brand_id", brand)
    .single();
  if (tErr || !target) return { ok: false, error: "找不到該料號（或不在當前品牌）" };
  if (target.item_id !== itemId) return { ok: false, error: "料號不屬於該商品" };

  const { error: clrErr } = await supabase
    .from("item_skus")
    .update({ is_primary: false })
    .eq("item_id", itemId)
    .eq("brand_id", brand)
    .eq("sku_type", target.sku_type)
    .neq("id", skuId);
  if (clrErr) return { ok: false, error: `清舊主要失敗：${clrErr.message}` };

  const { error: setErr } = await supabase
    .from("item_skus")
    .update({ is_primary: true })
    .eq("id", skuId)
    .eq("brand_id", brand);
  if (setErr) return { ok: false, error: `設定主要失敗：${setErr.message}` };

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: skuId } };
}

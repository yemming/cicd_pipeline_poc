"use server";

/**
 * Domain Helper — Items / SKUs（商品多維度料號）
 *
 * 提供：findItemBySku(code) — 跨 sku_type 查料號 → 回傳 item + 所有相關 skus
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type ItemRow = Tables["items"]["Row"];
export type ItemSkuRow = Tables["item_skus"]["Row"];

export type ItemWithSkus = ItemRow & {
  skus: ItemSkuRow[];
};

/**
 * 多維度查料號：依 sku_type 過濾或全部，找到第一筆 match 的 sku_code → 回該 item 的全套 SKUs
 */
export async function findItemBySku(
  code: string,
  options: { sku_type?: string } = {},
): Promise<ItemWithSkus | null> {
  if (!code.trim()) return null;
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("item_skus")
    .select("item_id")
    .eq("brand_id", scope.brand_id)
    .ilike("sku_code", code.trim())
    .limit(1);
  if (options.sku_type) q = q.eq("sku_type", options.sku_type);

  const { data: matched, error } = await q;
  if (error) throw error;

  let itemId: string | null = matched?.[0]?.item_id ?? null;

  // 若用 sku 沒撈到、再試直接用 items.code
  if (!itemId) {
    const { data: itemDirect, error: iErr } = await supabase
      .from("items")
      .select("id")
      .eq("brand_id", scope.brand_id)
      .ilike("code", code.trim())
      .limit(1);
    if (iErr) throw iErr;
    itemId = itemDirect?.[0]?.id ?? null;
  }
  if (!itemId) return null;

  const [itemRes, skusRes] = await Promise.all([
    supabase.from("items").select("*").eq("id", itemId).single(),
    supabase
      .from("item_skus")
      .select("*")
      .eq("item_id", itemId)
      .order("is_primary", { ascending: false })
      .order("sku_type"),
  ]);
  if (itemRes.error) throw itemRes.error;
  if (skusRes.error) throw skusRes.error;
  return {
    ...(itemRes.data as ItemRow),
    skus: (skusRes.data ?? []) as ItemSkuRow[],
  };
}

export async function getItemsInfoPageData(query: {
  q?: string;
  sku_type?: string;
}): Promise<{
  result: ItemWithSkus | null;
  searched: boolean;
  canEdit: boolean;
}> {
  const [result, canEdit] = await Promise.all([
    query.q ? findItemBySku(query.q, { sku_type: query.sku_type }) : Promise.resolve(null),
    hasPermission(PERMISSIONS.ITEM_EDIT),
  ]);
  return { result, searched: !!query.q, canEdit };
}

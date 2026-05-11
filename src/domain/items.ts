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

/**
 * GL 科目（Chart of Accounts）下拉選項——只回 leaf-level 可入帳且啟用的。
 * 用於 items 詳情頁「會計」tab 的 inline select。
 *
 * 注意：chart_of_accounts 用 tenant_id（groups.tenant_uuid），不是 brand_id；
 * brand 是行銷虛軸，COA 屬於法人/集團層的 master data。
 */
export type CoaAccountOption = {
  id: string;
  account_code: string;
  name_zh_tw: string;
};

export async function listPostableAccountsForItem(): Promise<CoaAccountOption[]> {
  const supabase = await createClient();

  // 撈 default tenant uuid（同 src/lib/accounting/queries.ts#getDefaultTenantUuid）
  const { data: g, error: gErr } = await supabase
    .from("groups")
    .select("tenant_uuid")
    .eq("id", "default")
    .single();
  if (gErr || !g) return [];
  const tenant = g.tenant_uuid as string;

  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, name_zh_tw")
    .eq("tenant_id", tenant)
    .eq("is_postable", true)
    .eq("is_active", true)
    .order("account_code", { ascending: true });
  if (error) return [];
  return (data ?? []) as CoaAccountOption[];
}

export type ItemGlAccount = {
  id: string;
  account_code: string;
  name_zh_tw: string;
};

/**
 * 撈 item 三個 GL FK 對應的 (code, name) 顯示資料。
 * 若某欄為 null 則對應 key 為 null。
 */
export async function getItemGlAccounts(item: {
  gl_inventory_coa_id: string | null;
  gl_cogs_coa_id: string | null;
  gl_revenue_coa_id: string | null;
}): Promise<{
  inventory: ItemGlAccount | null;
  cogs: ItemGlAccount | null;
  revenue: ItemGlAccount | null;
}> {
  const ids = [
    item.gl_inventory_coa_id,
    item.gl_cogs_coa_id,
    item.gl_revenue_coa_id,
  ].filter((x): x is string => !!x);

  if (ids.length === 0) {
    return { inventory: null, cogs: null, revenue: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, name_zh_tw")
    .in("id", ids);
  if (error) return { inventory: null, cogs: null, revenue: null };

  const map = new Map(
    (data ?? []).map((c) => [
      c.id as string,
      {
        id: c.id as string,
        account_code: c.account_code as string,
        name_zh_tw: c.name_zh_tw as string,
      },
    ]),
  );
  return {
    inventory: item.gl_inventory_coa_id ? map.get(item.gl_inventory_coa_id) ?? null : null,
    cogs: item.gl_cogs_coa_id ? map.get(item.gl_cogs_coa_id) ?? null : null,
    revenue: item.gl_revenue_coa_id ? map.get(item.gl_revenue_coa_id) ?? null : null,
  };
}

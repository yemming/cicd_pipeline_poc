"use server";

/**
 * Domain Helper — Item Store Pricing（門市定價）
 *
 * 撈商品 + 各門店售價、計算毛利率
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type ItemRow = Tables["items"]["Row"];
export type ItemStorePriceRow = Tables["item_store_prices"]["Row"];

export type StoreOption = { id: string; name: string };

export type PricingRow = {
  id: string;             // item_id
  code: string;
  name: string;
  standard_cost: number | null;
  suggested_price: number | null;
  store_price: number | null;          // 該 store 的 price (null = 用建議)
  pricing_type: "default" | "store_custom" | "promo";
  promo_end_date: string | null;
  margin_pct: number | null;
  price_id: string | null;             // 給更新用
};

function calcMargin(price: number | null, cost: number | null): number | null {
  if (price === null || cost === null || price === 0) return null;
  return Math.round(((price - cost) / price) * 1000) / 10;
}

export async function listStores(): Promise<StoreOption[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("brand_id", scope.brand_id)
    .eq("type", "store")
    .eq("is_active", true)
    .order("code");
  if (error) throw error;
  return (data ?? []) as StoreOption[];
}

export async function listPricing(filter: {
  store_id?: string;
  q?: string;
}): Promise<PricingRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  // 撈所有 active items
  let iq = supabase
    .from("items")
    .select("id, code, name, standard_cost, suggested_price")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true)
    .order("code")
    .limit(200);
  if (filter.q) iq = iq.or(`code.ilike.%${filter.q}%,name.ilike.%${filter.q}%`);
  const { data: items, error: iErr } = await iq;
  if (iErr) throw iErr;

  // 撈該 store 的所有 prices
  let prices: ItemStorePriceRow[] = [];
  if (filter.store_id && (items?.length ?? 0) > 0) {
    const { data: pData, error: pErr } = await supabase
      .from("item_store_prices")
      .select("*")
      .eq("brand_id", scope.brand_id)
      .eq("org_id", filter.store_id)
      .in(
        "item_id",
        items!.map((it) => it.id),
      );
    if (pErr) throw pErr;
    prices = (pData ?? []) as ItemStorePriceRow[];
  }

  const priceByItem = new Map<string, ItemStorePriceRow>();
  for (const p of prices) if (p.item_id) priceByItem.set(p.item_id, p);

  return (items ?? []).map((it) => {
    const p = priceByItem.get(it.id);
    const isPromo =
      p?.pricing_type === "promo" ||
      (p?.promo_end_date && new Date(p.promo_end_date) > new Date());
    const pricing_type: PricingRow["pricing_type"] = isPromo
      ? "promo"
      : p?.pricing_type === "store_custom" || (p && p.price !== null)
        ? "store_custom"
        : "default";
    const effectivePrice = p?.price ?? it.suggested_price ?? null;
    return {
      id: it.id,
      code: it.code ?? "",
      name: it.name ?? "",
      standard_cost: it.standard_cost,
      suggested_price: it.suggested_price,
      store_price: effectivePrice,
      pricing_type,
      promo_end_date: p?.promo_end_date ?? null,
      margin_pct: calcMargin(effectivePrice, it.standard_cost),
      price_id: p?.id ?? null,
    };
  });
}

export async function getPricingPageData(filter: {
  store_id?: string;
  q?: string;
}): Promise<{
  stores: StoreOption[];
  rows: PricingRow[];
  activeStoreId: string | null;
  activeStoreName: string | null;
  canEdit: boolean;
}> {
  const stores = await listStores();
  const activeStoreId = filter.store_id ?? stores[0]?.id ?? null;
  const activeStore = stores.find((s) => s.id === activeStoreId) ?? null;
  const [rows, canEdit] = await Promise.all([
    activeStoreId
      ? listPricing({ store_id: activeStoreId, q: filter.q })
      : Promise.resolve([] as PricingRow[]),
    hasPermission(PERMISSIONS.ITEM_EDIT),
  ]);
  return {
    stores,
    rows,
    activeStoreId,
    activeStoreName: activeStore?.name ?? null,
    canEdit,
  };
}

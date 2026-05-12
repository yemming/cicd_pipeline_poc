/**
 * 供應商定價（supplier_item_pricing）admin 後台 helper — server-only。
 *
 * MRP 用的「廠商 → 料 → 單價 / 前置期 / MOQ」master data。
 * 跟 retail 端的 `src/domain/pricing.ts`（item_store_prices）是不同概念，
 * 分檔避免混淆。
 *
 * 注意：
 *   - getSupplierPricingById 仍在 lib/master-data/queries.ts，B5 收尾再整併。
 *   - server actions 仍在 lib/master-data/supplier-pricing-actions.ts，不動。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import type { SupplierPricingRow } from "@/lib/master-data/supplier-pricing-form-types";

import type {
  SupplierOption,
  ItemOption,
  SupplierPricingFilters,
} from "@/app/(workspace)/admin/master-data/supplier-pricing/_components/supplier-pricing-board";
import type {
  SupplierRef,
  ItemRef,
} from "@/app/(workspace)/admin/master-data/supplier-pricing/[id]/_components/supplier-pricing-detail-view";

export type SupplierPricingAdminResult = {
  rows: SupplierPricingRow[];
  suppliers: SupplierOption[];
  items: ItemOption[];
  totalCount: number;
};

export async function listSupplierPricingForAdmin(
  filters: SupplierPricingFilters,
): Promise<SupplierPricingAdminResult> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("supplier_item_pricing")
    .select(
      "id, brand_id, supplier_id, item_id, is_primary, unit_price, currency, lead_time_days, min_order_qty, order_multiple, valid_from, valid_to, notes, is_active, created_at, updated_at",
    )
    .eq("brand_id", brand);

  if (filters.supplier !== "all") q = q.eq("supplier_id", filters.supplier);
  if (filters.item !== "all") q = q.eq("item_id", filters.item);
  if (filters.primary === "primary") q = q.eq("is_primary", true);
  if (filters.primary === "secondary") q = q.eq("is_primary", false);
  if (filters.status === "active") q = q.eq("is_active", true);
  if (filters.status === "inactive") q = q.eq("is_active", false);
  if (filters.q.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.ilike("notes", `%${t}%`);
  }

  const [pRes, sRes, iRes, totalRes] = await Promise.all([
    q.order("updated_at", { ascending: false }).limit(500),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("items")
      .select("id, code, name, category")
      .eq("brand_id", brand)
      .order("code")
      .limit(500),
    supabase
      .from("supplier_item_pricing")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand),
  ]);

  if (pRes.error) throw new Error(`supplier_item_pricing: ${pRes.error.message}`);
  if (sRes.error) throw new Error(`suppliers: ${sRes.error.message}`);
  if (iRes.error) throw new Error(`items: ${iRes.error.message}`);

  return {
    rows: (pRes.data ?? []) as unknown as SupplierPricingRow[],
    suppliers: (sRes.data ?? []) as unknown as SupplierOption[],
    items: (iRes.data ?? []) as unknown as ItemOption[],
    totalCount: totalRes.count ?? 0,
  };
}

/**
 * Detail / new 頁面用的 supplier + item lookup。
 *   - activeOnly: list 頁面要 active=true、detail 頁面要含停用版（看歷史）
 *   - itemLimit: 500（list） / 1000（detail：item 候選清單要更廣）
 */
export async function listSupplierPricingLookups(opts: {
  activeOnly?: boolean;
  itemLimit?: number;
}): Promise<{ suppliers: SupplierRef[]; items: ItemRef[] }> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let sQ = supabase
    .from("suppliers")
    .select("id, code, name")
    .eq("brand_id", brand)
    .order("code");
  if (opts.activeOnly !== false) sQ = sQ.eq("is_active", true);

  const [sRes, iRes] = await Promise.all([
    sQ,
    supabase
      .from("items")
      .select("id, code, name, category, base_uom")
      .eq("brand_id", brand)
      .order("code")
      .limit(opts.itemLimit ?? 1000),
  ]);
  if (sRes.error) throw new Error(`suppliers: ${sRes.error.message}`);
  if (iRes.error) throw new Error(`items: ${iRes.error.message}`);

  return {
    suppliers: (sRes.data ?? []) as unknown as SupplierRef[],
    items: (iRes.data ?? []) as unknown as ItemRef[],
  };
}

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { SupplierPricingRow } from "@/lib/master-data/supplier-pricing-form-types";

import { getActiveScope } from "@/lib/scope/active-scope";
import {
  SupplierPricingBoard,
  type ItemOption,
  type SupplierOption,
  type SupplierPricingFilters,
} from "./_components/supplier-pricing-board";

export const dynamic = "force-dynamic";

async function loadData(filters: SupplierPricingFilters) {
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

export default async function SupplierPricingListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.SUPPLIER_PRICING_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視供應商定價的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.SUPPLIER_PRICING_EDIT);
  const sp = await searchParams;
  const filters: SupplierPricingFilters = {
    supplier: sp.supplier ?? "all",
    item: sp.item ?? "all",
    primary: sp.primary ?? "all",
    status: sp.status ?? "all",
    q: sp.q ?? "",
  };
  const { rows, suppliers, items, totalCount } = await loadData(filters);

  return (
    <SupplierPricingBoard
      rows={rows}
      suppliers={suppliers}
      items={items}
      canEdit={canEdit}
      totalCount={totalCount}
      filters={filters}
    />
  );
}

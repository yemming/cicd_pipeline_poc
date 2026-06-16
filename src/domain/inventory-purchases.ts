import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

// ─── 型別 ───────────────────────────────────────────────────────────────────

export type InventoryPurchaseRow = {
  id: string;
  received_at: string | null;
  item_code: string | null;
  item_name: string | null;
  qty: number;
  unit_cost: number;
  total_cost: number | null;
  purchase_order_id: string | null;
  receipt_id: string | null;
};

export type InventoryPurchaseFilters = {
  date_from?: string;
  date_to?: string;
};

// ─── Query ──────────────────────────────────────────────────────────────────

export async function listInventoryPurchases(
  filters: InventoryPurchaseFilters = {},
): Promise<{ rows: InventoryPurchaseRow[]; totalCount: number }> {
  const scope = await getActiveScope();
  const supabase = await createClient();

  let q = supabase
    .from("inventory_purchases")
    .select(
      `
      id,
      received_at,
      qty,
      unit_cost,
      total_cost,
      purchase_order_id,
      receipt_id,
      items!item_id(code, name)
      `,
      { count: "exact" },
    )
    .eq("brand_id", scope.brand_id)
    .order("received_at", { ascending: false });

  if (filters.date_from) {
    q = q.gte("received_at", filters.date_from);
  }
  if (filters.date_to) {
    // 含當天：date_to + 1 天
    const nextDay = new Date(filters.date_to);
    nextDay.setDate(nextDay.getDate() + 1);
    q = q.lt("received_at", nextDay.toISOString().slice(0, 10));
  }

  const { data, count, error } = await q;

  if (error) {
    console.error("[inventory-purchases] listInventoryPurchases error:", error.message);
    return { rows: [], totalCount: 0 };
  }

  const rows: InventoryPurchaseRow[] = (data ?? []).map((d) => {
    // Supabase join 回傳 single-row object 或 null
    const item = Array.isArray(d.items) ? d.items[0] : d.items;
    return {
      id: d.id,
      received_at: d.received_at,
      item_code: (item as { code?: string } | null)?.code ?? null,
      item_name: (item as { name?: string } | null)?.name ?? null,
      qty: d.qty,
      unit_cost: d.unit_cost,
      total_cost: d.total_cost,
      purchase_order_id: d.purchase_order_id,
      receipt_id: d.receipt_id,
    };
  });

  return { rows, totalCount: count ?? 0 };
}

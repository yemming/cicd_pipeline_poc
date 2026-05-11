"use server";

/**
 * Domain Helper — Stock Items（庫存查詢）
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type StockItemRow = Tables["stock_items"]["Row"];

export type StockBalanceRow = {
  item_id: string;
  item_code: string;
  item_name: string;
  warehouse_id: string | null;
  warehouse_name: string | null;
  on_hand_qty: number;
  status_breakdown: Record<string, number>;
};

export async function listStockBalance(filter: {
  q?: string;
  warehouse_id?: string;
} = {}): Promise<StockBalanceRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  // 撈 stock_items
  let q = supabase
    .from("stock_items")
    .select("item_id, warehouse_id, qty, status")
    .eq("brand_id", scope.brand_id)
    .limit(2000);
  if (filter.warehouse_id) q = q.eq("warehouse_id", filter.warehouse_id);
  const { data: stocks, error: sErr } = await q;
  if (sErr) throw sErr;
  if (!stocks || stocks.length === 0) return [];

  // group by (item_id, warehouse_id)
  const grouped = new Map<string, { qty: number; statuses: Record<string, number> }>();
  for (const s of stocks) {
    if (!s.item_id) continue;
    const key = `${s.item_id}::${s.warehouse_id ?? ""}`;
    const cur = grouped.get(key) ?? { qty: 0, statuses: {} };
    cur.qty += Number(s.qty ?? 0);
    const st = s.status ?? "on_hand";
    cur.statuses[st] = (cur.statuses[st] ?? 0) + Number(s.qty ?? 0);
    grouped.set(key, cur);
  }

  const itemIds = Array.from(new Set(stocks.map((s) => s.item_id).filter((x): x is string => !!x)));
  const warehouseIds = Array.from(new Set(stocks.map((s) => s.warehouse_id).filter((x): x is string => !!x)));

  const [iRes, wRes] = await Promise.all([
    itemIds.length > 0
      ? supabase.from("items").select("id, code, name").in("id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    warehouseIds.length > 0
      ? supabase.from("warehouses").select("id, name").in("id", warehouseIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (iRes.error) throw iRes.error;
  if (wRes.error) throw wRes.error;
  const iMap = new Map((iRes.data ?? []).map((i) => [i.id, { code: i.code ?? "", name: i.name ?? "" }]));
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  let rows: StockBalanceRow[] = [];
  for (const [key, val] of grouped) {
    const [itemId, whId] = key.split("::");
    const item = iMap.get(itemId);
    rows.push({
      item_id: itemId,
      item_code: item?.code ?? "",
      item_name: item?.name ?? "",
      warehouse_id: whId || null,
      warehouse_name: whId ? wMap.get(whId) ?? null : null,
      on_hand_qty: val.qty,
      status_breakdown: val.statuses,
    });
  }

  if (filter.q) {
    const ql = filter.q.toLowerCase();
    rows = rows.filter(
      (r) => r.item_code.toLowerCase().includes(ql) || r.item_name.toLowerCase().includes(ql),
    );
  }
  rows.sort((a, b) => (a.item_code < b.item_code ? -1 : 1));
  return rows;
}

export async function getStockBalancePageData(filter: {
  q?: string;
} = {}): Promise<{
  rows: StockBalanceRow[];
  canEdit: boolean;
}> {
  const [rows, canEdit] = await Promise.all([
    listStockBalance({ q: filter.q }),
    hasPermission(PERMISSIONS.RECEIPT_VIEW),
  ]);
  return { rows, canEdit };
}

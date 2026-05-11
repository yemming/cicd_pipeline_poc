"use server";

/**
 * Domain Helper — Stock Receipts（入庫單）
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type StockReceiptRow = Tables["stock_receipts"]["Row"];

export type StockReceiptListRow = StockReceiptRow & {
  vendor_name: string | null;
  warehouse_name: string | null;
};

export async function listReceipts(filter: {
  type?: string;
  status?: string;
  q?: string;
} = {}): Promise<StockReceiptListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("stock_receipts")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("receipt_date", { ascending: false })
    .limit(200);
  if (filter.type) q = q.eq("type", filter.type);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.q) q = q.ilike("gr_no", `%${filter.q}%`);

  const { data: rs, error } = await q;
  if (error) throw error;
  if (!rs || rs.length === 0) return [];

  const vIds = Array.from(new Set(rs.map((r) => r.vendor_id).filter((x): x is string => !!x)));
  const wIds = Array.from(new Set(rs.map((r) => r.warehouse_id).filter((x): x is string => !!x)));

  const [vRes, wRes] = await Promise.all([
    vIds.length > 0
      ? supabase.from("suppliers").select("id, name").in("id", vIds)
      : Promise.resolve({ data: [], error: null }),
    wIds.length > 0
      ? supabase.from("warehouses").select("id, name").in("id", wIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (vRes.error) throw vRes.error;
  if (wRes.error) throw wRes.error;
  const vMap = new Map((vRes.data ?? []).map((v) => [v.id, v.name]));
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  return rs.map((r) => ({
    ...r,
    vendor_name: r.vendor_id ? vMap.get(r.vendor_id) ?? null : null,
    warehouse_name: r.warehouse_id ? wMap.get(r.warehouse_id) ?? null : null,
  }));
}

export async function getReceiptsPageData(filter: {
  type?: string;
  status?: string;
  q?: string;
} = {}): Promise<{
  rows: StockReceiptListRow[];
  canEdit: boolean;
}> {
  const [rows, canEdit] = await Promise.all([
    listReceipts(filter),
    hasPermission(PERMISSIONS.RECEIPT_CREATE),
  ]);
  return { rows, canEdit };
}

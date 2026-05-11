"use server";

/**
 * Domain Helper — Purchase Orders（商品採購單）
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type PurchaseOrderRow = Tables["purchase_orders"]["Row"];

export type PurchaseOrderListRow = PurchaseOrderRow & {
  vendor_name: string | null;
  warehouse_name: string | null;
};

export async function listPurchaseOrders(filter: {
  status?: string;
  q?: string;
} = {}): Promise<PurchaseOrderListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("purchase_orders")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("po_date", { ascending: false })
    .limit(200);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.q) q = q.ilike("po_no", `%${filter.q}%`);

  const { data: pos, error } = await q;
  if (error) throw error;
  if (!pos || pos.length === 0) return [];

  const vendorIds = Array.from(new Set(pos.map((p) => p.vendor_id).filter((x): x is string => !!x)));
  const warehouseIds = Array.from(new Set(pos.map((p) => p.warehouse_id).filter((x): x is string => !!x)));

  const [vRes, wRes] = await Promise.all([
    vendorIds.length > 0
      ? supabase.from("suppliers").select("id, name").in("id", vendorIds)
      : Promise.resolve({ data: [], error: null }),
    warehouseIds.length > 0
      ? supabase.from("warehouses").select("id, name").in("id", warehouseIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (vRes.error) throw vRes.error;
  if (wRes.error) throw wRes.error;

  const vMap = new Map((vRes.data ?? []).map((v) => [v.id, v.name]));
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  return pos.map((p) => ({
    ...p,
    vendor_name: p.vendor_id ? vMap.get(p.vendor_id) ?? null : null,
    warehouse_name: p.warehouse_id ? wMap.get(p.warehouse_id) ?? null : null,
  }));
}

export async function getOrdersPageData(filter: {
  status?: string;
  q?: string;
} = {}): Promise<{
  rows: PurchaseOrderListRow[];
  canEdit: boolean;
}> {
  const [rows, canEdit] = await Promise.all([
    listPurchaseOrders(filter),
    hasPermission(PERMISSIONS.PO_CREATE),
  ]);
  return { rows, canEdit };
}

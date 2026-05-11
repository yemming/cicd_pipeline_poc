"use server";

/**
 * Domain Helper — Inventory Adjustments（庫存調整 / 例外進出）
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type InventoryAdjustmentRow = Tables["inventory_adjustments"]["Row"];

export type AdjustmentListRow = InventoryAdjustmentRow & {
  warehouse_name: string | null;
};

export async function listAdjustments(filter: {
  type?: string;
  status?: string;
  q?: string;
} = {}): Promise<AdjustmentListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("inventory_adjustments")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter.type) q = q.eq("type", filter.type);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.q) q = q.ilike("adj_no", `%${filter.q}%`);

  const { data: adjs, error } = await q;
  if (error) throw error;
  if (!adjs || adjs.length === 0) return [];

  const wIds = Array.from(new Set(adjs.map((a) => a.warehouse_id).filter((x): x is string => !!x)));
  const wRes = wIds.length > 0
    ? await supabase.from("warehouses").select("id, name").in("id", wIds)
    : { data: [], error: null };
  if (wRes.error) throw wRes.error;
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  return adjs.map((a) => ({
    ...a,
    warehouse_name: a.warehouse_id ? wMap.get(a.warehouse_id) ?? null : null,
  }));
}

export async function getExceptionsPageData(filter: {
  status?: string;
  q?: string;
} = {}): Promise<{
  rows: AdjustmentListRow[];
  canEdit: boolean;
}> {
  const [rows, canEdit] = await Promise.all([
    listAdjustments(filter),
    hasPermission(PERMISSIONS.EXCEPTION_OPS),
  ]);
  return { rows, canEdit };
}

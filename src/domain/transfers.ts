"use server";

/**
 * Domain Helper — Stock Transfers（調撥）
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type StockTransferRow = Tables["stock_transfers"]["Row"];

export type TransferListRow = StockTransferRow & {
  source_warehouse_name: string | null;
  target_warehouse_name: string | null;
};

export async function listTransfers(filter: {
  status_in?: string[];
  q?: string;
} = {}): Promise<TransferListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("stock_transfers")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("ship_date", { ascending: false })
    .limit(200);
  if (filter.status_in?.length) q = q.in("status", filter.status_in);
  if (filter.q) q = q.ilike("tr_no", `%${filter.q}%`);

  const { data: ts, error } = await q;
  if (error) throw error;
  if (!ts || ts.length === 0) return [];

  const wIds = Array.from(
    new Set(
      ts
        .flatMap((t) => [t.source_warehouse_id, t.target_warehouse_id])
        .filter((x): x is string => !!x),
    ),
  );
  const wRes = wIds.length > 0
    ? await supabase.from("warehouses").select("id, name").in("id", wIds)
    : { data: [], error: null };
  if (wRes.error) throw wRes.error;
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  return ts.map((t) => ({
    ...t,
    source_warehouse_name: t.source_warehouse_id ? wMap.get(t.source_warehouse_id) ?? null : null,
    target_warehouse_name: t.target_warehouse_id ? wMap.get(t.target_warehouse_id) ?? null : null,
  }));
}

export async function getTransferInPageData(): Promise<{
  rows: TransferListRow[];
  canEdit: boolean;
}> {
  const [rows, canEdit] = await Promise.all([
    listTransfers({ status_in: ["in_transit", "partial", "received"] }),
    hasPermission(PERMISSIONS.RECEIPT_CREATE),
  ]);
  return { rows, canEdit };
}

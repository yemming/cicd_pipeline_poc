/**
 * 進口成本補列 domain helper — server-only（讀取層）
 *
 * 補列 = 批次結算後才到的費用（遲來的運費發票、追加報關費…）。
 * 用 import_cost_pool_lines + metadata.is_post_addition 標記，三道關：
 *   申請(pending) → 主管簽核(approved/rejected) → commit 才納入分攤（landed-cost-actions 把關）。
 * 不另開表。天條：UI 只 import 本 helper / actions。
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CostAdditionStatus = "pending" | "approved" | "rejected";

export type CostAdditionRow = {
  id: string;
  shipment_id: string;
  shipment_no: string | null;
  cost_type: string;
  amount: number;
  allocation_basis: string;
  is_inventoriable: boolean;
  payee: string | null;
  reason: string | null;
  approval_status: CostAdditionStatus;
  approved_at: string | null;
  applied: boolean; // 是否已被 commit 納入（有對應 allocation）
  created_at: string | null;
};

export type CostAdditionFilters = { status?: string };

export async function listCostAdditions(
  filters: CostAdditionFilters = {},
): Promise<CostAdditionRow[]> {
  const supabase = await createClient();
  const base = supabase
    .from("import_cost_pool_lines")
    .select("id, shipment_id, cost_type, amount, allocation_basis, is_inventoriable, payee, metadata, created_at")
    .contains("metadata", { is_post_addition: true })
    .order("created_at", { ascending: false });
  const q =
    filters.status && filters.status !== "all"
      ? base.contains("metadata", { approval_status: filters.status })
      : base;
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];

  // shipment_no
  const shipmentIds = [...new Set(rows.map((r) => r.shipment_id as string).filter(Boolean))];
  const shipNo = new Map<string, string>();
  if (shipmentIds.length) {
    const { data: sData } = await supabase
      .from("import_shipments")
      .select("id, shipment_no")
      .in("id", shipmentIds);
    for (const s of (sData ?? []) as Array<{ id: string; shipment_no: string }>) shipNo.set(s.id, s.shipment_no);
  }

  // applied：是否已有對應 allocation
  const ids = rows.map((r) => r.id as string);
  const appliedSet = new Set<string>();
  if (ids.length) {
    const { data: aData } = await supabase
      .from("import_cost_allocations")
      .select("pool_line_id")
      .in("pool_line_id", ids);
    for (const a of (aData ?? []) as Array<{ pool_line_id: string }>) appliedSet.add(a.pool_line_id);
  }

  return rows.map((r) => {
    const m = (r.metadata as Record<string, unknown>) ?? {};
    return {
      id: r.id as string,
      shipment_id: r.shipment_id as string,
      shipment_no: shipNo.get(r.shipment_id as string) ?? null,
      cost_type: r.cost_type as string,
      amount: Number(r.amount ?? 0),
      allocation_basis: r.allocation_basis as string,
      is_inventoriable: r.is_inventoriable !== false,
      payee: (r.payee as string) ?? null,
      reason: (m.reason as string) ?? null,
      approval_status: (m.approval_status as CostAdditionStatus) ?? "pending",
      approved_at: (m.approved_at as string) ?? null,
      applied: appliedSet.has(r.id as string),
      created_at: (r.created_at as string) ?? null,
    };
  });
}

/** 批次下拉（申請補列時挑批次） */
export async function listShipmentsForAddition(): Promise<
  Array<{ id: string; shipment_no: string; gl_posted: boolean }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_shipments")
    .select("id, shipment_no, gl_posted")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; shipment_no: string; gl_posted: boolean | null }>).map((s) => ({
    id: s.id,
    shipment_no: s.shipment_no,
    gl_posted: s.gl_posted ?? false,
  }));
}

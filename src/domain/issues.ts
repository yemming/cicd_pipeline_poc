"use server";

/**
 * Domain Helper — Stock Issues（出庫單）
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type StockIssueRow = Tables["stock_issues"]["Row"];

export type StockIssueListRow = StockIssueRow & {
  warehouse_name: string | null;
};

export async function listIssues(filter: {
  type?: string;
  status?: string;
  q?: string;
} = {}): Promise<StockIssueListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("stock_issues")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("issue_date", { ascending: false })
    .limit(200);
  if (filter.type) q = q.eq("type", filter.type);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.q) q = q.ilike("gi_no", `%${filter.q}%`);

  const { data: rs, error } = await q;
  if (error) throw error;
  if (!rs || rs.length === 0) return [];

  const wIds = Array.from(new Set(rs.map((r) => r.warehouse_id).filter((x): x is string => !!x)));
  const wRes = wIds.length > 0
    ? await supabase.from("warehouses").select("id, name").in("id", wIds)
    : { data: [], error: null };
  if (wRes.error) throw wRes.error;
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  return rs.map((r) => ({
    ...r,
    warehouse_name: r.warehouse_id ? wMap.get(r.warehouse_id) ?? null : null,
  }));
}

export async function getIssuesPageData(filter: {
  type?: string;
  status?: string;
  q?: string;
} = {}): Promise<{
  rows: StockIssueListRow[];
  canEdit: boolean;
}> {
  const [rows, canEdit] = await Promise.all([
    listIssues(filter),
    hasPermission(PERMISSIONS.ISSUE_CREATE),
  ]);
  return { rows, canEdit };
}

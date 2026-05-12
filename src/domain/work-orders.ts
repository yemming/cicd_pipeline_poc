/**
 * 維修工單 admin 後台 helper — server-only。
 *
 * 涵蓋 /admin/master-data/work-orders/[id] 編輯頁需要的 fetch：
 *   - 工單行（work_order_items）
 *   - active 倉庫（發料對話框用）
 *   - 該工單已發料 issue 列表（避免重複發料）
 *
 * 注意：
 *   - getWorkOrderById 仍在 lib/master-data/queries.ts，B5 收尾再整併
 *   - listActiveWarehouses 暫放這裡（自包），B5 dedupe 時再決定要不要搬到 warehouse.ts
 *   - server actions 在 lib/master-data/workorder-actions.ts，不動
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import type { Warehouse, WorkOrderItem } from "@/lib/parts/types";

export type WorkOrderIssueSummary = {
  id: string;
  gi_no: string;
  status: string;
  qty_issued_total: number;
  amount_total: number;
  warehouse_id: string;
  issue_date: string;
};

export async function listActiveWarehouses(): Promise<Warehouse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("is_active", true)
    .order("code");
  if (error) throw new Error(`listActiveWarehouses: ${error.message}`);
  return data ?? [];
}

export async function listWorkOrderItems(workOrderId: string): Promise<WorkOrderItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_order_items")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("work_order_id", workOrderId)
    .order("line_no");
  if (error) throw new Error(`listWorkOrderItems: ${error.message}`);
  return data ?? [];
}

export async function listIssuesForWorkOrder(
  roId: string,
): Promise<WorkOrderIssueSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_issues")
    .select(
      "id, gi_no, status, qty_issued_total, amount_total, warehouse_id, issue_date",
    )
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("ro_id", roId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listIssuesForWorkOrder: ${error.message}`);
  return (data ?? []) as WorkOrderIssueSummary[];
}

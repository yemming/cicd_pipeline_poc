import "server-only";

/**
 * Domain Helper — 投訴記錄（complaints 表）
 * 寫入走 src/lib/aftersales/complaint-actions.ts。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

export type ComplaintRow = {
  id: string;
  customer_id: string;
  vehicle_id: string | null;
  repair_order_id: string | null;
  /** 關聯銷售訂單 ID（F-3：欄位 complaints.related_sales_order_id） */
  related_sales_order_id: string | null;
  complaint_type: string | null;
  description: string | null;
  status: string;
  result: string | null;
  handled_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** join：RO 編號（若有關聯） */
  ro_code: string | null;
  /** join：關聯銷售訂單單號（若有關聯） */
  sales_order_no: string | null;
};

/** 銷售訂單精簡查詢結果（供新增/編輯投訴時的訂單搜尋選單使用） */
export type SalesOrderSearchRow = {
  id: string;
  order_no: string;
  customer_name: string | null;
  vehicle_model_name: string | null;
  status: string;
};

/** 撈某客戶的投訴歷史（DESC created_at，最多 30 筆）*/
export async function listComplaintsByCustomer(
  customerId: string,
): Promise<ComplaintRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data, error } = await supabase
    .from("complaints")
    .select(
      "id, customer_id, vehicle_id, repair_order_id, related_sales_order_id, complaint_type, description, status, result, handled_by, created_by, created_at, updated_at",
    )
    .eq("brand_id", brand)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("[complaints] listComplaintsByCustomer", error.message);
    return [];
  }

  const rows = (data ?? []) as Array<{
    id: string;
    customer_id: string;
    vehicle_id: string | null;
    repair_order_id: string | null;
    related_sales_order_id: string | null;
    complaint_type: string | null;
    description: string | null;
    status: string;
    result: string | null;
    handled_by: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  }>;

  // 撈關聯工單編號（repair_orders.ro_code）
  const roIds = Array.from(
    new Set(rows.map((r) => r.repair_order_id).filter((x): x is string => Boolean(x))),
  );
  const roCodeMap = new Map<string, string>();
  if (roIds.length > 0) {
    const { data: roData } = await supabase
      .from("repair_orders")
      .select("id, ro_code")
      .in("id", roIds)
      .eq("brand_id", brand);
    for (const ro of (roData ?? []) as Array<{ id: string; ro_code: string }>) {
      roCodeMap.set(ro.id, ro.ro_code);
    }
  }

  // 撈關聯銷售訂單單號（sales_orders.order_no）
  const soIds = Array.from(
    new Set(rows.map((r) => r.related_sales_order_id).filter((x): x is string => Boolean(x))),
  );
  const soNoMap = new Map<string, string>();
  if (soIds.length > 0) {
    const { data: soData } = await supabase
      .from("sales_orders")
      .select("id, order_no")
      .in("id", soIds)
      .eq("brand_id", brand);
    for (const so of (soData ?? []) as Array<{ id: string; order_no: string }>) {
      soNoMap.set(so.id, so.order_no);
    }
  }

  return rows.map((r) => ({
    ...r,
    ro_code: r.repair_order_id ? (roCodeMap.get(r.repair_order_id) ?? null) : null,
    sales_order_no: r.related_sales_order_id ? (soNoMap.get(r.related_sales_order_id) ?? null) : null,
  }));
}

/**
 * 依關鍵字搜尋銷售訂單（供建立投訴時選擇關聯訂單）。
 * 搜尋欄位：order_no、customer_name、vehicle_model_name。
 * 最多回 20 筆，DESC created_at。
 */
export async function searchSalesOrdersForComplaint(
  keyword: string,
): Promise<SalesOrderSearchRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const q = keyword.trim();
  let query = supabase
    .from("sales_orders")
    .select("id, order_no, customer_name, vehicle_model_name, status")
    .eq("brand_id", brand)
    .order("created_at", { ascending: false })
    .limit(20);

  if (q) {
    query = query.or(
      `order_no.ilike.%${q}%,customer_name.ilike.%${q}%,vehicle_model_name.ilike.%${q}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("[complaints] searchSalesOrdersForComplaint", error.message);
    return [];
  }
  return (data ?? []) as SalesOrderSearchRow[];
}

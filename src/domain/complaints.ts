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
      "id, customer_id, vehicle_id, repair_order_id, complaint_type, description, status, result, handled_by, created_by, created_at, updated_at",
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

  return rows.map((r) => ({
    ...r,
    ro_code: r.repair_order_id ? (roCodeMap.get(r.repair_order_id) ?? null) : null,
  }));
}

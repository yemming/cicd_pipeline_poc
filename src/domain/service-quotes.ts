import "server-only";

/**
 * Domain Helper — Service Quotes（04B 快速報價）讀取面
 * 寫入走 src/lib/aftersales/service-quote-actions.ts。表由 migration aftersales_full_loop_g1 建。
 */

import { createClient } from "@/lib/supabase/server";

export type VehiclePendingItem = {
  id: string;
  vehicleId: string;
  sourceQuoteId: string | null;
  itemDesc: string;
  reason: string | null;
  status: "pending" | "resolved";
  createdAt: string;
};

/** 某車輛的待處理項目（拒絕的追加項）— 下次回廠 / 預檢時帶出提醒 SA。 */
export async function listVehiclePendingItems(
  brandId: string,
  vehicleId: string,
): Promise<VehiclePendingItem[]> {
  const client = await createClient();
  const { data } = await client
    .from("vehicle_pending_items")
    .select("id, vehicle_id, source_quote_id, item_desc, reason, status, created_at")
    .eq("brand_id", brandId)
    .eq("vehicle_id", vehicleId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  return ((data ?? []) as Array<{
    id: string;
    vehicle_id: string;
    source_quote_id: string | null;
    item_desc: string;
    reason: string | null;
    status: "pending" | "resolved";
    created_at: string;
  }>).map((r) => ({
    id: r.id,
    vehicleId: r.vehicle_id,
    sourceQuoteId: r.source_quote_id,
    itemDesc: r.item_desc,
    reason: r.reason,
    status: r.status,
    createdAt: r.created_at,
  }));
}

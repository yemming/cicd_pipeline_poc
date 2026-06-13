import "server-only";

/**
 * Domain Helper — Service Quotes（04B 快速報價）讀取面
 * 寫入走 src/lib/aftersales/service-quote-actions.ts。表由 migration aftersales_full_loop_g1 建。
 */

import { createClient } from "@/lib/supabase/server";

export type VehiclePendingItemSafetyLevel = "緊急" | "警示" | "建議";

export type VehiclePendingItem = {
  id: string;
  vehicleId: string;
  sourceQuoteId: string | null;
  itemDesc: string;
  reason: string | null;
  status: "pending" | "resolved";
  createdAt: string;
  /** RP7：安全等級（metadata.safety_level）— 緊急/警示/建議 */
  safetyLevel: VehiclePendingItemSafetyLevel;
  /** RP7：客戶拒絕次數（metadata.reject_count），SA 手動新增為 0 */
  rejectCount: number;
  /** RP7：來源（addon 決策 / quick_quote 拒絕 / SA 手動）*/
  source: string;
};

function readMetaString(meta: unknown, key: string): string {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return "";
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

function readMetaNumber(meta: unknown, key: string): number {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return 0;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === "number" ? v : 0;
}

/** 某車輛的待處理項目（拒絕的追加項）— 下次回廠 / 預檢時帶出提醒 SA。
 *
 * RP7 擴充：metadata.safety_level（緊急/警示/建議）/ metadata.reject_count / metadata.source
 */
export async function listVehiclePendingItems(
  brandId: string,
  vehicleId: string,
): Promise<VehiclePendingItem[]> {
  const client = await createClient();
  const { data } = await client
    .from("vehicle_pending_items")
    .select("id, vehicle_id, source_quote_id, item_desc, reason, status, created_at, metadata")
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
    metadata: unknown;
  }>).map((r) => {
    const rawLevel = readMetaString(r.metadata, "safety_level");
    const safetyLevel: VehiclePendingItemSafetyLevel =
      rawLevel === "緊急" || rawLevel === "警示" ? rawLevel : "建議";
    return {
      id: r.id,
      vehicleId: r.vehicle_id,
      sourceQuoteId: r.source_quote_id,
      itemDesc: r.item_desc,
      reason: r.reason,
      status: r.status,
      createdAt: r.created_at,
      safetyLevel,
      rejectCount: readMetaNumber(r.metadata, "reject_count"),
      source: readMetaString(r.metadata, "source") || "addon_decision",
    };
  });
}

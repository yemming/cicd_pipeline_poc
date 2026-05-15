"use server";

/**
 * Domain Helper — 售後 取車通知（Pickup Notification）
 *
 * 對應頁面：/parts/aftersales/pickup-notifications
 * Spec：bb3b7121-ebc9-4fef-9843-aec5b01c8b77
 *
 * 資料來源：竣工複檢已通過（final_inspections.status='completed'）的工單
 *           + repair_orders / customers / vehicles JOIN
 * 寫入：append PickupNotificationRecord 進 final_inspections.notifications jsonb
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type {
  PickupChannel,
  PickupNotificationRecord,
} from "./pickup-notifications.constants";

export type PickupListRow = {
  final_inspection_id: string;
  repair_order_id: string;
  ro_code: string;
  ro_status: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
  signed_at: string | null;
  closed_at: string | null;
  pickup_records: PickupNotificationRecord[];
  last_pickup_at: string | null;
  preferred_channel: PickupChannel;
};

export type PickupFilters = {
  q?: string;
  scope?: "pending" | "sent" | "all";
};

function isPickupRecord(x: unknown): x is PickupNotificationRecord {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return r.kind === "pickup" && typeof r.channel === "string" && typeof r.sent_at === "string";
}

function pickPickupRecords(notifications: unknown): PickupNotificationRecord[] {
  if (!Array.isArray(notifications)) return [];
  return notifications.filter(isPickupRecord);
}

/**
 * 推測偏好通道：customer.metadata.preferred_channel > 預設 'line'
 */
function inferPreferredChannel(meta: Record<string, unknown> | null | undefined): PickupChannel {
  const v = meta?.preferred_channel;
  if (v === "sms" || v === "line" || v === "phone") return v;
  return "line";
}

export async function listPickupCandidates(
  filters: PickupFilters = {},
): Promise<PickupListRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 1. 撈 final_inspections（status=completed 為主，POC demo 也包含 in_progress 讓畫面有東西）
  const { data: fis, error } = await supabase
    .from("final_inspections")
    .select("id, repair_order_id, status, signed_at, closed_at, notifications")
    .eq("brand_id", brand)
    .order("closed_at", { ascending: false, nullsFirst: false })
    .order("signed_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const fiRows = fis ?? [];
  if (fiRows.length === 0) return [];

  const roIds = Array.from(new Set(fiRows.map((f) => f.repair_order_id).filter(Boolean) as string[]));
  if (roIds.length === 0) return [];

  // 2. JOIN repair_orders + customers + vehicles
  const { data: ros } = await supabase
    .from("repair_orders")
    .select("id, ro_code, status, customer_id, vehicle_id")
    .in("id", roIds);
  const customerIds = Array.from(
    new Set((ros ?? []).map((r) => r.customer_id).filter(Boolean) as string[]),
  );
  const vehicleIds = Array.from(
    new Set((ros ?? []).map((r) => r.vehicle_id).filter(Boolean) as string[]),
  );

  const [{ data: custs }, { data: vehs }] = await Promise.all([
    customerIds.length
      ? supabase
          .from("customers")
          .select("id, name, phone, metadata")
          .in("id", customerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; phone: string | null; metadata: Record<string, unknown> | null }> }),
    vehicleIds.length
      ? supabase
          .from("vehicles")
          .select("id, license_plate, model_name")
          .in("id", vehicleIds)
      : Promise.resolve({ data: [] as Array<{ id: string; license_plate: string | null; model_name: string | null }> }),
  ]);
  const cMap = new Map((custs ?? []).map((c) => [c.id, c]));
  const vMap = new Map((vehs ?? []).map((v) => [v.id, v]));
  const roMap = new Map((ros ?? []).map((r) => [r.id, r]));

  const out: PickupListRow[] = [];
  for (const fi of fiRows) {
    const ro = roMap.get(fi.repair_order_id);
    if (!ro) continue;
    const cust = ro.customer_id ? cMap.get(ro.customer_id) : null;
    const veh = ro.vehicle_id ? vMap.get(ro.vehicle_id) : null;
    const records = pickPickupRecords(fi.notifications);
    const lastPickupAt = records.length
      ? records.reduce((acc, r) => (r.sent_at > acc ? r.sent_at : acc), records[0].sent_at)
      : null;

    out.push({
      final_inspection_id: fi.id,
      repair_order_id: fi.repair_order_id,
      ro_code: ro.ro_code,
      ro_status: ro.status,
      customer_id: ro.customer_id ?? null,
      customer_name: cust?.name ?? null,
      customer_phone: cust?.phone ?? null,
      vehicle_license_plate: veh?.license_plate ?? null,
      vehicle_model_name: veh?.model_name ?? null,
      signed_at: fi.signed_at ?? null,
      closed_at: fi.closed_at ?? null,
      pickup_records: records,
      last_pickup_at: lastPickupAt,
      preferred_channel: inferPreferredChannel(cust?.metadata ?? null),
    });
  }

  // 3. q + scope 過濾（簡單 in-memory，量小）
  const q = filters.q?.trim().toLowerCase();
  const scope = filters.scope ?? "all";
  return out.filter((row) => {
    if (scope === "pending" && row.pickup_records.length > 0) return false;
    if (scope === "sent" && row.pickup_records.length === 0) return false;
    if (q) {
      const hay = [
        row.ro_code,
        row.customer_name ?? "",
        row.vehicle_license_plate ?? "",
        row.vehicle_model_name ?? "",
        row.customer_phone ?? "",
      ]
        .join("\n")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * 統計：今日（Asia/Taipei）已發送 / 待發送 / 平均等候
 *  - 已發送 = 今日 records 數量
 *  - 待發送 = 目前清單仍無 records 的筆數
 *  - 平均等候 = 各筆「最後 record - signed_at」分鐘平均（沒 records 的不算）
 */
export type PickupStats = {
  sent_today: number;
  pending: number;
  avg_wait_minutes: number | null;
};

export async function getPickupStats(): Promise<PickupStats> {
  const rows = await listPickupCandidates();
  const now = new Date();
  const tzNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const todayStr = `${tzNow.getFullYear()}-${String(tzNow.getMonth() + 1).padStart(2, "0")}-${String(tzNow.getDate()).padStart(2, "0")}`;

  let sentToday = 0;
  let pending = 0;
  const waits: number[] = [];

  for (const row of rows) {
    if (row.pickup_records.length === 0) {
      pending += 1;
      continue;
    }
    for (const rec of row.pickup_records) {
      if (rec.sent_at.startsWith(todayStr)) sentToday += 1;
    }
    if (row.signed_at && row.last_pickup_at) {
      const diffMs = new Date(row.last_pickup_at).getTime() - new Date(row.signed_at).getTime();
      if (diffMs > 0) waits.push(diffMs / 60000);
    }
  }
  const avg =
    waits.length > 0
      ? Math.round(waits.reduce((s, x) => s + x, 0) / waits.length)
      : null;
  return { sent_today: sentToday, pending, avg_wait_minutes: avg };
}

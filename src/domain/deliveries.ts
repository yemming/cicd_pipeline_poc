import "server-only";

/**
 * Deliveries domain helper — 交車業務邏輯
 *
 * 與 @/lib/deliveries（低階 CRUD helper）的分工：
 *   - lib/deliveries：supabase 直連 CRUD（insert / update / select）
 *   - domain/deliveries（本檔）：業務級別動作 + 連鎖副作用 + 車輛類型判定
 *
 * UI / page 層禁止直接 import supabase；所有讀寫透過這兩個 helper。
 */

import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/domain/audit-logs";
import { notifications } from "@/lib/notifications";
import { canCreateCallTask } from "@/lib/crm/call-task-guard";
import type { DeliveryRow } from "@/lib/deliveries";
import type { DeliveryVehicleKind, UsedCarDeliveryPrereq } from "./deliveries.constants";

// ─────────────────────────────────────────────────────────────
// 輔助：抓 sales_order.contract_type 判斷車輛類型
// ─────────────────────────────────────────────────────────────

/**
 * 依交車單關聯的銷售訂單判斷車輛類型。
 * 連鎖動作（sales_order 狀態更新 / 庫存狀態更新 / warranty reminder 分流）依此結果分流。
 *
 * 判斷依據：sales_orders.contract_type（'new' | 'used'）。
 * 若無 sales_order_id 或查不到，回 'unknown'（保守地跑新車流程）。
 */
export async function resolveDeliveryVehicleKind(
  delivery: Pick<DeliveryRow, "sales_order_id" | "brand_id">,
): Promise<DeliveryVehicleKind> {
  if (!delivery.sales_order_id) return "unknown";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_orders")
    .select("contract_type")
    .eq("id", delivery.sales_order_id)
    .maybeSingle();

  if (error || !data) return "unknown";

  const ct = (data as { contract_type: string }).contract_type;
  if (ct === "used") return "used";
  return "new"; // new 或未知預設走新車
}

// ─────────────────────────────────────────────────────────────
// 輪6-4：dispute_frozen 凍結檢查
// ─────────────────────────────────────────────────────────────

/**
 * 檢查交車單關聯的銷售訂單是否處於爭議凍結狀態。
 * 若凍結，自動化 chain 全部跳過，並通知主管。
 *
 * 回傳 true = 已凍結（應跳過）；false = 正常
 */
export async function checkAndNotifyDisputeFrozen(
  delivery: DeliveryRow,
): Promise<boolean> {
  if (!delivery.sales_order_id) return false;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_orders")
    .select("dispute_frozen, brand_id")
    .eq("id", delivery.sales_order_id)
    .maybeSingle();

  if (error || !data) return false;

  const so = data as { dispute_frozen: boolean; brand_id: string };
  if (!so.dispute_frozen) return false;

  // 凍結：記 audit_logs（非靜默）
  await writeAuditLog({
    table_name: "deliveries",
    record_id: delivery.id,
    action: "delivery_chain_skipped_frozen",
    brand_id: delivery.brand_id,
    before: { dispute_frozen: true, sales_order_id: delivery.sales_order_id },
    after: { reason: "sales_order.dispute_frozen=true，自動化連鎖動作全部跳過" },
  });

  // 通知 — 走 Notification Hub，事件 'delivery.chain_frozen'（使用 deploy.released 作佔位，
  // 待 EventCode 擴充後改掛正式事件碼；目前同一 EventCode 機制，僅用 payload 區分）
  // 注意：因 EventCode 是 Closed Union，此處先用現有事件碼中最接近業務語意的
  // 'aftersales_followup.escalated'（有對應主管通知訂閱），等通知系統擴充 EventCode 後再換。
  try {
    await notifications.dispatch({
      code: "aftersales_followup.escalated",
      payload: {
        subject: "⚠️ 交車連鎖動作已凍結",
        deliveryId: delivery.id,
        deliveryNo: delivery.delivery_no,
        customerName: delivery.customer_name ?? "（未知客戶）",
        salesOrderId: delivery.sales_order_id,
        reason: "sales_order.dispute_frozen=true，自動化連鎖動作（訂單狀態/庫存/D+3電訪/保固提醒）已全部暫停",
        actionUrl: `/sales/delivery?deliveryId=${delivery.id}`,
      },
    });
  } catch (e) {
    // 通知失敗不影響主流程，但必須記錄（非靜默）
    console.error("[delivery chain frozen] 通知發送失敗（audit 已記錄）", e);
  }

  return true;
}

// ─────────────────────────────────────────────────────────────
// 輪6-3：交車完成連鎖動作 — ① sales_order.status → delivered
// ─────────────────────────────────────────────────────────────

/**
 * 交車完成後將關聯銷售訂單的狀態更新為 'delivered'。
 * 失敗時記 audit_logs，不 throw（不影響交車主流程）。
 */
export async function markSalesOrderDelivered(
  delivery: DeliveryRow,
): Promise<boolean> {
  if (!delivery.sales_order_id) return false;

  const supabase = await createClient();
  const { error } = await supabase
    .from("sales_orders")
    .update({ status: "delivered" })
    .eq("id", delivery.sales_order_id);

  if (error) {
    await writeAuditLog({
      table_name: "sales_orders",
      record_id: delivery.sales_order_id,
      action: "status_update_failed",
      brand_id: delivery.brand_id,
      before: null,
      after: {
        intended_status: "delivered",
        error: error.message,
        delivery_id: delivery.id,
      },
    });

    try {
      await notifications.dispatch({
        code: "aftersales_followup.escalated",
        payload: {
          subject: "⚠️ 交車後銷售訂單狀態更新失敗",
          deliveryId: delivery.id,
          deliveryNo: delivery.delivery_no,
          customerName: delivery.customer_name ?? "（未知客戶）",
          salesOrderId: delivery.sales_order_id,
          error: error.message,
          actionUrl: `/sales/delivery?deliveryId=${delivery.id}`,
        },
      });
    } catch (ne) {
      console.error("[markSalesOrderDelivered] 通知發送失敗", ne);
    }
    return false;
  }

  await writeAuditLog({
    table_name: "sales_orders",
    record_id: delivery.sales_order_id,
    action: "status_changed",
    brand_id: delivery.brand_id,
    before: null,
    after: { status: "delivered", triggered_by: "delivery_completed", delivery_id: delivery.id },
  });

  return true;
}

// ─────────────────────────────────────────────────────────────
// 輪6-3：交車完成連鎖動作 — ② 庫存狀態 → sold
// ─────────────────────────────────────────────────────────────

/**
 * 交車完成後更新車輛庫存狀態為 'sold'。
 * 新車走 new_car_inventory（VIN 匹配），中古車走 used_car_inventory（VIN 匹配）。
 * 失敗時記 audit_logs + 通知，不 throw。
 */
export async function markInventorySold(
  delivery: DeliveryRow,
  vehicleKind: DeliveryVehicleKind,
): Promise<boolean> {
  const vin = delivery.vin?.trim() || null;
  if (!vin) return false;

  const supabase = await createClient();
  const table = vehicleKind === "used" ? "used_car_inventory" : "new_car_inventory";

  const { error } = await supabase
    .from(table)
    .update({ status: "sold" })
    .eq("brand_id", delivery.brand_id)
    .eq("vin", vin);

  if (error) {
    await writeAuditLog({
      table_name: table,
      record_id: delivery.id,
      action: "inventory_sold_update_failed",
      brand_id: delivery.brand_id,
      before: null,
      after: {
        intended_status: "sold",
        vin,
        error: error.message,
        delivery_id: delivery.id,
      },
    });

    try {
      await notifications.dispatch({
        code: "aftersales_followup.escalated",
        payload: {
          subject: `⚠️ 交車後 ${table} 狀態更新失敗`,
          deliveryId: delivery.id,
          deliveryNo: delivery.delivery_no,
          customerName: delivery.customer_name ?? "（未知客戶）",
          vin,
          error: error.message,
          actionUrl: `/sales/delivery?deliveryId=${delivery.id}`,
        },
      });
    } catch (ne) {
      console.error("[markInventorySold] 通知發送失敗", ne);
    }
    return false;
  }

  await writeAuditLog({
    table_name: table,
    record_id: delivery.id,
    action: "inventory_status_changed",
    brand_id: delivery.brand_id,
    before: null,
    after: { status: "sold", vin, triggered_by: "delivery_completed", delivery_id: delivery.id },
  });

  return true;
}

// ─────────────────────────────────────────────────────────────
// 輪6-3：交車完成連鎖動作 — ③ D+3 電訪任務
// ─────────────────────────────────────────────────────────────

/**
 * 交車完成後在電訪工作台建立 D+3 滿意度回訪任務（call_tasks）。
 * kind='sales'（銷售側）、call_type='d3_followup'。
 * 失敗時記 audit_logs + 通知，不 throw。
 */
export async function scheduleD3FollowupTask(
  delivery: DeliveryRow,
): Promise<boolean> {
  if (!delivery.customer_id) return false;

  // 缺口四：客戶標記請勿聯繫/已故 → 不建任務（guard 內已寫 audit log）
  const guard = await canCreateCallTask(delivery.customer_id, delivery.brand_id);
  if (!guard.allowed) return false;

  const deliveredAt = delivery.delivered_at
    ? new Date(delivery.delivered_at)
    : new Date();

  const scheduledAt = new Date(deliveredAt);
  scheduledAt.setUTCDate(scheduledAt.getUTCDate() + 3);

  const supabase = await createClient();
  const { error } = await supabase.from("call_tasks").insert({
    brand_id: delivery.brand_id,
    kind: "sales",
    customer_id: delivery.customer_id,
    call_type: "d3_followup",
    scheduled_at: scheduledAt.toISOString(),
    status: "pending",
    metadata: {
      source: "delivery_completed",
      delivery_id: delivery.id,
      delivery_no: delivery.delivery_no,
      vehicle_model_name: delivery.vehicle_model_name,
    },
  });

  if (error) {
    await writeAuditLog({
      table_name: "call_tasks",
      record_id: delivery.id,
      action: "d3_task_create_failed",
      brand_id: delivery.brand_id,
      before: null,
      after: {
        call_type: "d3_followup",
        scheduled_at: scheduledAt.toISOString(),
        error: error.message,
        delivery_id: delivery.id,
      },
    });

    try {
      await notifications.dispatch({
        code: "aftersales_followup.escalated",
        payload: {
          subject: "⚠️ 交車後 D+3 電訪任務建立失敗",
          deliveryId: delivery.id,
          deliveryNo: delivery.delivery_no,
          customerName: delivery.customer_name ?? "（未知客戶）",
          error: error.message,
          actionUrl: `/crm/sales/call-tasks`,
        },
      });
    } catch (ne) {
      console.error("[scheduleD3FollowupTask] 通知發送失敗", ne);
    }
    return false;
  }

  await writeAuditLog({
    table_name: "call_tasks",
    record_id: delivery.id,
    action: "d3_task_created",
    brand_id: delivery.brand_id,
    before: null,
    after: {
      call_type: "d3_followup",
      scheduled_at: scheduledAt.toISOString(),
      delivery_id: delivery.id,
    },
  });

  return true;
}

// ─────────────────────────────────────────────────────────────
// 輪6-2：中古車前置條件確認
// ─────────────────────────────────────────────────────────────

/**
 * 中古車交車前置條件確認：查 used_car_inventory.metadata.condition_report.customer_acknowledged_at。
 *
 * 串接鏈：
 *   deliveries.vin + brand_id → used_car_inventory
 *     → metadata.condition_report.customer_acknowledged_at（客戶已確認車況時間戳）
 *
 * 兩態判定：
 *   ok       有 customer_acknowledged_at → 可進下一步
 *   blocked  無對應車輛 / 無 customer_acknowledged_at → 鎖
 */
export async function getUsedCarDeliveryPrereq(
  deliveryId: string,
): Promise<UsedCarDeliveryPrereq> {
  const supabase = await createClient();

  const empty: UsedCarDeliveryPrereq = {
    state: "blocked",
    canProceed: false,
    hasLinkedCar: false,
    carId: null,
    carStatus: null,
    customerAcknowledgedAt: null,
  };

  // 1) 撈交車單 VIN + brand
  const { data: dlv, error: dlvErr } = await supabase
    .from("deliveries")
    .select("vin, brand_id")
    .eq("id", deliveryId)
    .maybeSingle();
  if (dlvErr) throw dlvErr;
  if (!dlv?.vin) return empty;

  // 2) VIN + brand → used_car_inventory
  const { data: car, error: carErr } = await supabase
    .from("used_car_inventory")
    .select("id, status, metadata")
    .eq("brand_id", dlv.brand_id)
    .eq("vin", dlv.vin)
    .maybeSingle();
  if (carErr) throw carErr;
  if (!car) return empty;

  const carRow = car as { id: string; status: string; metadata: Record<string, unknown> | null };

  const conditionReport = (carRow.metadata?.condition_report ?? null) as Record<string, unknown> | null;
  const acknowledgedAt = (conditionReport?.customer_acknowledged_at as string | null) ?? null;

  const result: UsedCarDeliveryPrereq = {
    state: acknowledgedAt ? "ok" : "blocked",
    canProceed: Boolean(acknowledgedAt),
    hasLinkedCar: true,
    carId: carRow.id,
    carStatus: carRow.status,
    customerAcknowledgedAt: acknowledgedAt,
  };

  return result;
}

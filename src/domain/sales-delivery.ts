import "server-only";

/**
 * Sales Delivery domain helper（M01-9）
 *
 * 既有 list/CRUD/wizard step 函式仍由 `@/lib/deliveries` 處理，本檔提供
 * A 級 visualization 用的聚合資料：
 *   - getDeliveryKpis：頂部 KpiCard 4 顆
 *   - getDeliveryKanbanData：5 column 看板
 *   - getDeliveryTimeline：詳情面板事件流（依 step_completion + 時間欄位推導）
 *
 * UI 仍只 import 本檔 + `@/lib/deliveries`（後者也是 server-only helper），
 * 沒有違反「UI 禁止 import @/lib/supabase」天條。
 */

import { createClient } from "@/lib/supabase/server";
import type { DeliveryRow } from "@/lib/deliveries";
import type { DeliveryStatus } from "@/lib/deliveries.constants";
import {
  DELIVERY_KANBAN_COLUMNS,
  DELIVERY_STATUS_LABELS,
  DELIVERY_STEP_LABELS,
  getKanbanColumnIdByStatus,
  type DeliveryKanbanCard,
  type DeliveryKpiSummary,
  type DeliveryTimelineEvent,
} from "./sales-delivery.constants";

// Re-export 給 server caller 直接從本檔拿
export type {
  DeliveryKpiSummary,
  DeliveryKanbanCard,
  DeliveryTimelineEvent,
} from "./sales-delivery.constants";

const ACTIVE_STATUSES: DeliveryStatus[] = [
  "scheduled",
  "pdi_in_progress",
  "pdi_complete",
  "accessories_complete",
  "delivery_confirmed",
  "warranty_signed",
  "ceremony_ready",
];

const PDI_PENDING_STATUSES: DeliveryStatus[] = ["pdi_in_progress"];

/**
 * 聚合 KPI（4 顆 KpiCard 用）。RLS 已鎖 brand，不需顯式過濾。
 */
export async function getDeliveryKpis(): Promise<DeliveryKpiSummary> {
  const supabase = await createClient();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const monthStart = `${todayStr.slice(0, 7)}-01`;

  // 全部撈 active + 本月 delivered，記憶體聚合（量級數百筆內，server-side 算過水）
  const { data, error } = await supabase
    .from("deliveries")
    .select("status, scheduled_delivery_date, actual_delivery_date")
    .or(
      `status.in.(${ACTIVE_STATUSES.join(",")}),and(status.eq.delivered,actual_delivery_date.gte.${monthStart})`,
    );
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    status: DeliveryStatus;
    scheduled_delivery_date: string | null;
    actual_delivery_date: string | null;
  }>;

  const summary: DeliveryKpiSummary = {
    todayCount: 0,
    pendingScheduleCount: 0,
    pdiPendingCount: 0,
    monthDeliveredCount: 0,
  };

  for (const r of rows) {
    if (r.status === "delivered") {
      if (r.actual_delivery_date && r.actual_delivery_date >= monthStart) {
        summary.monthDeliveredCount += 1;
      }
      continue;
    }
    // active
    if (r.scheduled_delivery_date === todayStr) summary.todayCount += 1;
    if (r.status === "scheduled") summary.pendingScheduleCount += 1;
    if (PDI_PENDING_STATUSES.includes(r.status)) summary.pdiPendingCount += 1;
  }

  return summary;
}

/**
 * 撈 Kanban 卡片（active 不含 cancelled / delivered 太舊的 → 只看「進行中 + 本月已交」）
 */
export async function getDeliveryKanbanData(): Promise<DeliveryKanbanCard[]> {
  const supabase = await createClient();
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStart = `${todayStr.slice(0, 7)}-01`;

  const { data, error } = await supabase
    .from("deliveries")
    .select(
      "id, delivery_no, status, customer_name, vehicle_model_name, vehicle_color, scheduled_delivery_date, actual_delivery_date, rs_name",
    )
    .or(
      `status.in.(${ACTIVE_STATUSES.join(",")}),and(status.eq.delivered,actual_delivery_date.gte.${monthStart})`,
    )
    .order("scheduled_delivery_date", { ascending: true, nullsFirst: false })
    .limit(200);

  if (error) throw error;

  const rows = (data ?? []) as Array<
    Pick<
      DeliveryRow,
      | "id"
      | "delivery_no"
      | "status"
      | "customer_name"
      | "vehicle_model_name"
      | "vehicle_color"
      | "scheduled_delivery_date"
      | "rs_name"
    >
  >;

  const cards: DeliveryKanbanCard[] = [];
  for (const r of rows) {
    const colId = getKanbanColumnIdByStatus(r.status);
    if (!colId) continue;
    cards.push({
      id: r.id,
      columnId: colId,
      delivery_no: r.delivery_no,
      customer_name: r.customer_name,
      vehicle_model_name: r.vehicle_model_name,
      vehicle_color: r.vehicle_color,
      scheduled_delivery_date: r.scheduled_delivery_date,
      rs_name: r.rs_name,
      status: r.status,
    });
  }
  return cards;
}

/**
 * 依交車單 step_completion + 時間欄位組事件流（給 Detail Panel 的 Timeline 用）
 */
export async function getDeliveryTimeline(
  deliveryId: string,
): Promise<DeliveryTimelineEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deliveries")
    .select(
      "created_at, scheduled_delivery_date, actual_delivery_date, plate_date, warranty_registered_at, delivered_at, step_completion, status",
    )
    .eq("id", deliveryId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return [];

  const stepCompletion = (data.step_completion ?? {}) as Record<
    string,
    { completed_at?: string } | undefined
  >;

  const events: DeliveryTimelineEvent[] = [];
  events.push({
    id: "created",
    time: data.created_at,
    title: "建立交車單",
    tone: "gray",
  });
  if (data.scheduled_delivery_date) {
    events.push({
      id: "scheduled",
      time: `${data.scheduled_delivery_date}T00:00:00`,
      title: "排定交車日",
      description: data.scheduled_delivery_date,
      tone: "blue",
    });
  }

  for (const stepName of Object.keys(DELIVERY_STEP_LABELS) as Array<
    keyof typeof DELIVERY_STEP_LABELS
  >) {
    const rec = stepCompletion[stepName];
    if (rec?.completed_at) {
      events.push({
        id: `step-${stepName}`,
        time: rec.completed_at,
        title: `完成步驟：${DELIVERY_STEP_LABELS[stepName]}`,
        tone: "teal",
      });
    }
  }

  if (data.plate_date) {
    events.push({
      id: "plate",
      time: `${data.plate_date}T00:00:00`,
      title: "完成領牌",
      description: data.plate_date,
      tone: "amber",
    });
  }
  if (data.warranty_registered_at) {
    events.push({
      id: "warranty",
      time: data.warranty_registered_at,
      title: "完成保固登錄",
      tone: "purple",
    });
  }
  if (data.delivered_at) {
    events.push({
      id: "delivered",
      time: data.delivered_at,
      title: "已交車給客戶",
      description: `狀態：${DELIVERY_STATUS_LABELS[data.status as DeliveryStatus]}`,
      tone: "green",
    });
  }

  // 依時間排序
  events.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  return events;
}

export { DELIVERY_KANBAN_COLUMNS };

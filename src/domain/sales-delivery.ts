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
import { createServiceClient } from "@/lib/supabase/service";
import type { DeliveryRow } from "@/lib/deliveries";
import type { DeliveryStatus } from "@/lib/deliveries.constants";
import {
  DELIVERY_KANBAN_COLUMNS,
  DELIVERY_STATUS_LABELS,
  DELIVERY_STEP_LABELS,
  getKanbanColumnIdByStatus,
  type DeliveryKanbanCard,
  type DeliveryKpiSummary,
  type DeliveryPdiStatus,
  type DeliveryTimelineEvent,
} from "./sales-delivery.constants";

// Re-export 給 server caller 直接從本檔拿
export type {
  DeliveryKpiSummary,
  DeliveryKanbanCard,
  DeliveryPdiStatus,
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

// repair_orders.status 為中文 enum；「已關單」代表 PDI 工單完成
const RO_CLOSED_STATUS = "已關單";
// 視為「PDI 已完成、可售」的車輛狀態（PDI 在到港時做完才會進這些狀態）
const CAR_PDI_DONE_STATUSES = new Set(["displayed", "reserved", "sold", "delivered"]);

/**
 * 查「該交車單關聯車輛的 PDI 完成狀態」（RS05 STEP — PDI 完成確認）。
 *
 * 串接鏈：
 *   deliveries.vin ─(VIN + brand)→ new_car_inventory
 *     → new_car_inventory.pdi_workorder_id → repair_orders（PDI 工單，PD-IN）
 *
 * PDI 不是在交車當天才做，而是車輛到港入庫(INV02)時即觸發、技師做完關單。
 * 本函式只「讀狀態」決定交車流程能不能往下走，不寫任何資料、不建工單。
 *
 * 三態判定：
 *   ok       車已 displayed/reserved/sold/delivered 且 PDI 工單已關單 → 可進下一步
 *   pending  車 pending_pdi 且工單存在但未關單                       → 鎖
 *   blocked  車 pending_pdi 無工單 / 找不到關聯車輛 / 其他異常        → 鎖
 */
export async function getDeliveryPdiStatus(
  deliveryId: string,
): Promise<DeliveryPdiStatus> {
  // 步驟 1 用 user client（驗交車單存取權），步驟 2-4 用 service client（PDI 是客觀事實，不受 brand scope RLS 影響）
  const supabase = await createClient();
  const svc = createServiceClient();

  const empty: DeliveryPdiStatus = {
    state: "blocked",
    canProceed: false,
    hasLinkedCar: false,
    carId: null,
    carStatus: null,
    workOrderNo: null,
    workOrderStatus: null,
    workOrderClosed: false,
    completedDate: null,
    technicianName: null,
    pdiLaborCost: null,
    pdiPartsCost: null,
  };

  // 1) 撈交車單 VIN + brand（用 user client 確認使用者有存取權）
  const { data: dlv, error: dlvErr } = await supabase
    .from("deliveries")
    .select("vin, brand_id")
    .eq("id", deliveryId)
    .maybeSingle();
  if (dlvErr) {
    console.error("[PDI] step1 deliveries error:", dlvErr.message);
    throw dlvErr;
  }
  console.log("[PDI] step1 dlv:", dlv);
  if (!dlv?.vin) return empty; // 沒 VIN 無從對車 → blocked（找不到關聯車輛）

  // 2) VIN + brand join 庫存車（用 service client 繞過 brand scope RLS）
  const { data: car, error: carErr } = await svc
    .from("new_car_inventory")
    .select(
      "id, status, pdi_workorder_id, pdi_labor_cost, pdi_parts_cost",
    )
    .eq("brand_id", dlv.brand_id)
    .eq("vin", dlv.vin)
    .maybeSingle();
  if (carErr) {
    console.error("[PDI] step2 new_car_inventory error:", carErr.message);
    throw carErr;
  }
  console.log("[PDI] step2 car:", car);
  if (!car) return empty; // VIN 對不到庫存車（例如 demo 交車單未串庫存）→ blocked

  const result: DeliveryPdiStatus = {
    ...empty,
    hasLinkedCar: true,
    carId: car.id,
    carStatus: car.status,
    pdiLaborCost: car.pdi_labor_cost ?? null,
    pdiPartsCost: car.pdi_parts_cost ?? null,
  };

  // 3) 撈 PDI 工單（用 service client）
  if (car.pdi_workorder_id) {
    const { data: ro, error: roErr } = await svc
      .from("repair_orders")
      .select("ro_code, status, closed_at, lead_technician_id")
      .eq("id", car.pdi_workorder_id)
      .maybeSingle();
    if (roErr) {
      console.error("[PDI] step3 repair_orders error:", roErr.message);
      throw roErr;
    }
    console.log("[PDI] step3 ro:", ro);
    if (ro) {
      result.workOrderNo = ro.ro_code;
      result.workOrderStatus = ro.status;
      result.workOrderClosed = ro.status === RO_CLOSED_STATUS;
      result.completedDate = ro.closed_at ? ro.closed_at.slice(0, 10) : null;
      if (ro.lead_technician_id) {
        const { data: emp } = await svc
          .from("employees")
          .select("name")
          .eq("id", ro.lead_technician_id)
          .maybeSingle();
        result.technicianName = emp?.name ?? null;
      }
    }
  }

  // 4) 推導三態
  const carDone = CAR_PDI_DONE_STATUSES.has(car.status);
  console.log("[PDI] step4 carDone:", carDone, "workOrderClosed:", result.workOrderClosed, "pdi_workorder_id:", car.pdi_workorder_id);
  if (carDone && result.workOrderClosed) {
    // 正常完成：車可售 + 工單關單
    result.state = "ok";
    result.canProceed = true;
  } else if (carDone && !car.pdi_workorder_id) {
    // 車已可售但沒掛 PDI 工單（舊資料 / 手動上架）— 視為已完成（車況已是可售）
    result.state = "ok";
    result.canProceed = true;
  } else if (car.pdi_workorder_id && !result.workOrderClosed) {
    // 工單還在跑 → 進行中
    result.state = "pending";
  } else {
    // pending_pdi 無工單、或工單狀態異常 → blocked
    result.state = "blocked";
  }

  console.log("[PDI] result:", result.state, "canProceed:", result.canProceed, "hasLinkedCar:", result.hasLinkedCar);
  return result;
}

export { DELIVERY_KANBAN_COLUMNS };

/**
 * Sales Delivery — client-safe constants（types / labels / chip 顏色 / kanban 設定）
 *
 * 給 client component 拿來 import 不會把 server-only 模組牽進來。
 */

import type { ToneKey } from "@/components/visualization";

// Re-export 現役 types（舊 caller 仍可從 .constants 拿）
export type {
  DeliveryStatus,
  DeliveryStepName,
} from "@/lib/deliveries.constants";

export {
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_CHIP,
  DELIVERY_STEP_NAMES,
  DELIVERY_STEP_LABELS,
} from "@/lib/deliveries.constants";

import type { DeliveryStatus } from "@/lib/deliveries.constants";

// ─── Kanban column 設定 ───────────────────────────────────
// 把 9 狀態收斂為 5 個業務 column（避免左右拖卷太長）
export type DeliveryKanbanColumnId =
  | "scheduled"
  | "pdi"
  | "ready"
  | "ceremony"
  | "delivered";

export const DELIVERY_KANBAN_COLUMNS: ReadonlyArray<{
  id: DeliveryKanbanColumnId;
  title: string;
  tone: ToneKey;
  statuses: DeliveryStatus[];
}> = [
  { id: "scheduled",  title: "已排程",         tone: "blue",   statuses: ["scheduled"] },
  { id: "pdi",        title: "PDI 整備中",      tone: "amber",  statuses: ["pdi_in_progress", "pdi_complete"] },
  { id: "ready",      title: "等待客戶交車",     tone: "teal",   statuses: ["accessories_complete", "delivery_confirmed", "warranty_signed"] },
  { id: "ceremony",   title: "交車儀式中",       tone: "purple", statuses: ["ceremony_ready"] },
  { id: "delivered",  title: "已交車",          tone: "green",  statuses: ["delivered"] },
] as const;

export function getKanbanColumnIdByStatus(s: DeliveryStatus): DeliveryKanbanColumnId | null {
  if (s === "cancelled") return null;
  for (const col of DELIVERY_KANBAN_COLUMNS) {
    if (col.statuses.includes(s)) return col.id;
  }
  return null;
}

// ─── KPI / Kanban data shape ──────────────────────────────
export type DeliveryKpiSummary = {
  /** 今日預定交車（scheduled_delivery_date = today 且未交） */
  todayCount: number;
  /** 待排程（status='scheduled' 且 scheduled_delivery_date IS NULL 或未來 7 天內） */
  pendingScheduleCount: number;
  /** PDI 待做（pdi_in_progress + pdi_complete 之前） */
  pdiPendingCount: number;
  /** 本月已交（status='delivered' 且 actual_delivery_date 落在當月） */
  monthDeliveredCount: number;
};

export type DeliveryKanbanCard = {
  id: string;
  columnId: DeliveryKanbanColumnId;
  delivery_no: string;
  customer_name: string | null;
  vehicle_model_name: string | null;
  vehicle_color: string | null;
  scheduled_delivery_date: string | null;
  rs_name: string | null;
  // 原始 status（供卡片內顯示精準狀態）
  status: DeliveryStatus;
};

export type DeliveryTimelineEvent = {
  id: string;
  time: string;
  title: string;
  description?: string;
  tone: ToneKey;
};

// ─── PDI 完成確認（RS05 STEP / pdi-view）──────────────────────
// PDI 工單在「車輛到港入庫」(INV02) 即觸發、技師做完關單；交車時只「確認 PDI 已完成」。
// 三種狀態卡依「該交車單關聯車輛的 PDI 工單狀態」判定：
//   ok       車輛已 displayed/reserved/sold/delivered 且 PDI 工單已關單 → 綠卡，可進下一步
//   pending  車輛 pending_pdi 且工單仍進行中（未關單）          → 黃卡，下一步鎖
//   blocked  車輛 pending_pdi 但無工單 / 找不到關聯車輛 / 異常    → 紅卡，下一步鎖
export type DeliveryPdiState = "ok" | "pending" | "blocked";

export type DeliveryPdiStatus = {
  /** 三態：決定顯示哪張卡、是否允許進下一步 */
  state: DeliveryPdiState;
  /** state === 'ok' 才可進入後續交車流程 */
  canProceed: boolean;
  /** 是否有對應到一台庫存車（VIN join 成功） */
  hasLinkedCar: boolean;
  /** 關聯車輛 id（new_car_inventory.id） */
  carId: string | null;
  /** 關聯車輛狀態（new_car_inventory.status） */
  carStatus: string | null;
  /** PDI 工單號（repair_orders.ro_code） */
  workOrderNo: string | null;
  /** PDI 工單狀態（repair_orders.status，中文：已關單 / 進行中 …） */
  workOrderStatus: string | null;
  /** 是否已關單 */
  workOrderClosed: boolean;
  /** 完成（關單）日期 yyyy-mm-dd，若有 */
  completedDate: string | null;
  /** 執行技師姓名（lead_technician_id → employees.name），seed 多為 null */
  technicianName: string | null;
  /** PDI 工時費（計入整車成本） */
  pdiLaborCost: number | null;
  /** PDI 零件費（計入整車成本） */
  pdiPartsCost: number | null;
};

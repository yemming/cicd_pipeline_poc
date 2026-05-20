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

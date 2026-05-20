/**
 * Constants & types for /parts/purchase/replenishment (Run List 視角 — A 級)
 *
 * 為什麼跟 src/domain/replenishment.ts 並存：
 *   - replenishment.ts 是「最新一筆 run 的 working-board」（被 balance-actions.ts 用）
 *   - 本檔 + parts-replenishment.ts 是「多 runs 的歷史 / 審批 / 生 PO」視角
 *
 * 純常數 / 型別，client 可 import。
 */

export type RunListStatus =
  | "open"
  | "approved"
  | "rejected"
  | "partially_converted"
  | "converted";

export const RUN_STATUS_LABEL: Record<RunListStatus, { label: string; tone: string }> = {
  open: { label: "待審核", tone: "bg-[#FDF3E3] text-[#854F0B]" },
  approved: { label: "已核准", tone: "bg-[#EAF3DE] text-[#3B6D11]" },
  rejected: { label: "已駁回", tone: "bg-[#F2F2F2] text-[#6B6A68]" },
  partially_converted: { label: "部分轉單", tone: "bg-[#EAF4FB] text-[#185FA5]" },
  converted: { label: "已生 PO", tone: "bg-[#E8F5F0] text-[#0F6E56]" },
};

export const TRIGGER_KIND_LABEL: Record<string, string> = {
  manual: "手動觸發",
  scheduled: "排程",
  auto: "自動",
};

export const PRIORITY_LABEL: Record<string, string> = {
  urgent: "緊急",
  normal: "一般",
  low: "低",
};
export const PRIORITY_BADGE: Record<string, string> = {
  urgent: "bg-[#FDECEA] text-[#CC0000]",
  normal: "bg-[#FDF3E3] text-[#854F0B]",
  low: "bg-[#F2F2F2] text-[#6B6A68]",
};

export type ReplenishmentRunRow = {
  id: string;
  brand_id: string;
  warehouse_id: string | null;
  warehouse_label: string | null;
  horizon_days: number;
  trigger_kind: string;
  total_lines: number;
  total_amount: number;
  status: RunListStatus;
  approval_status: "pending" | "approved" | "rejected"; // 自 metadata 派生
  approval_note: string | null;
  approved_at: string | null;
  approved_by_label: string | null;
  rejected_at: string | null;
  rejected_by_label: string | null;
  generated_po_ids: string[]; // 自 metadata 派生
  created_at: string;
  created_label: string;
};

export type ReplenishmentRunLineRow = {
  id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  abc_class: string | null;
  on_hand_qty: number;
  on_order_qty: number;
  reorder_point: number;
  safety_stock: number;
  gross_demand_qty: number;
  net_demand_qty: number;
  suggested_qty: number;
  unit_price: number;
  est_amount: number;
  supplier_id: string | null;
  supplier_name: string | null;
  lead_time_days: number | null;
  required_date: string | null;
  priority: "urgent" | "normal" | "low";
  status: "open" | "converted" | "ignored";
};

export type ReplenishmentKpis = {
  monthRuns: number;
  pendingReview: number;
  generatedPo: number;
  avgAmount: number;
};

export type ReplenishmentFilters = {
  status?: RunListStatus | "all";
  warehouseId?: string | "all";
  month?: string; // 'YYYY-MM'，空字串 / undefined = 全部
};

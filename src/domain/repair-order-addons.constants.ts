/**
 * repair-order-addons constants — UI 與 server module 共用的 types / labels / tones。
 *
 * 為什麼拆出來：domain helper 用 "use server"，server-only module 只能 export
 * async function declaration（鐵律 #8），types 必須抽出。
 */

import type { ToneKey } from "@/components/visualization";

export type AddonType = "labor" | "parts" | "labor_and_parts";
export type SafetyLevel = "normal" | "safety_related" | "safety_critical";
export type ConfirmMethod = "phone" | "onsite" | "line";
export type CustomerDecision =
  | "pending"
  | "agreed"
  | "deferred"
  | "rejected"
  | "cancelled";

export type RepairOrderAddonRow = {
  id: string;
  brand_id: string;
  ro_id: string;
  addon_no: number;
  name: string;
  addon_type: AddonType;
  safety_level: SafetyLevel;
  estimated_fee: number;
  tech_reason: string | null;
  proposed_by: string | null;
  proposed_at: string;
  confirm_method: ConfirmMethod | null;
  customer_decision: CustomerDecision;
  customer_decision_at: string | null;
  decided_by_sa_id: string | null;
  decision_note: string | null;
  followup_case_id: string | null;
  reserved_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RepairOrderAddonWithRo = RepairOrderAddonRow & {
  ro: {
    id: string;
    ro_code: string;
    status: string;
    customer_name: string | null;
    vehicle_license_plate: string | null;
  } | null;
};

export type AddonsListFilter = {
  decision?: CustomerDecision | "all";
  safetyLevel?: SafetyLevel | "all";
  roId?: string | null;
  q?: string | null;
};

export type AddonsSummary = {
  total: number;
  pending: number;
  agreed: number;
  deferred: number;
  rejected: number;
  cancelled: number;
  agreedAmount: number;
  rejectedAmount: number;
  followupNeeded: number;
};

export type RoOptionForAddons = {
  id: string;
  ro_code: string;
  status: string;
  customer_name: string | null;
};

// ── Labels（中文）
export const DECISION_LABEL: Record<CustomerDecision, string> = {
  pending: "待確認",
  agreed: "車主同意",
  deferred: "暫緩",
  rejected: "拒絕",
  cancelled: "已取消",
};

export const SAFETY_LABEL: Record<SafetyLevel, string> = {
  normal: "一般建議",
  safety_related: "⚠️ 安全相關",
  safety_critical: "🔴 安全警示",
};

export const TYPE_LABEL: Record<AddonType, string> = {
  labor: "工項",
  parts: "零件",
  labor_and_parts: "零件+工",
};

export const CONFIRM_LABEL: Record<ConfirmMethod, string> = {
  phone: "電話口頭",
  onsite: "現場本人",
  line: "Line 文字",
};

// ── Chips（舊調色 — 給 DataGrid cell 內聯使用，保留原 hex）
export const DECISION_CHIP: Record<CustomerDecision, string> = {
  pending: "bg-[#FDF3E3] text-[#854F0B]",
  agreed: "bg-[#EAF3DE] text-[#3B6D11]",
  deferred: "bg-[#EAF4FB] text-[#185FA5]",
  rejected: "bg-[#FDECEA] text-[#CC0000]",
  cancelled: "bg-[#F2F2F2] text-[#6B6A68]",
};

export const SAFETY_CHIP: Record<SafetyLevel, string> = {
  normal: "bg-[#F2F2F2] text-[#6B6A68]",
  safety_related: "bg-[#FDF3E3] text-[#854F0B]",
  safety_critical: "bg-[#FDECEA] text-[#CC0000]",
};

// ── Tone 對映（給 KanbanBoard column / KpiCard 用）
export const DECISION_TONE: Record<CustomerDecision, ToneKey> = {
  pending: "amber",
  agreed: "green",
  deferred: "blue",
  rejected: "red",
  cancelled: "gray",
};

export const SAFETY_TONE: Record<SafetyLevel, ToneKey> = {
  normal: "gray",
  safety_related: "amber",
  safety_critical: "red",
};

// ── Kanban columns（看板視圖）
// cancelled 不放看板（已歸檔狀態），只保留四欄主要決策流
export const ADDON_KANBAN_COLUMNS: ReadonlyArray<{
  id: CustomerDecision;
  title: string;
  tone: ToneKey;
}> = [
  { id: "pending", title: "待確認（技師提議）", tone: "amber" },
  { id: "agreed", title: "車主同意（已寫工單）", tone: "green" },
  { id: "deferred", title: "暫緩", tone: "blue" },
  { id: "rejected", title: "拒絕", tone: "red" },
];

// ── Donut chart palette（決策分佈）
export const DECISION_DONUT_COLOR: Record<CustomerDecision, string> = {
  pending: "#F59E0B",
  agreed: "#22C55E",
  deferred: "#3B82F6",
  rejected: "#EF4444",
  cancelled: "#9A9890",
};

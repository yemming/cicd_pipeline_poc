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

/**
 * 拒絕原因（B-23）— 結構化固定標籤，存 metadata.rejection_reason。
 * 業界依據：CDK Global《Service Revenue Optimization 2025》— 結構化採集是診斷
 * SA 說服能力缺口的唯一可靠方法。自由文字補充沿用既有 decision_note。
 */
export type RejectionReason =
  | "price"
  | "time"
  | "unnecessary"
  | "consider"
  | "other";

// ── B3：客戶自帶零件確認書（叉路 B1 / 追加項目「客戶自備料」標記）──────
// 標記存 repair_order_addons.metadata（agreed 後同步快照到衍生的 repair_order_lines.metadata），
// 不開新表。標記後系統不建立庫存預留（見 domain/tech-workstation.ts addAddon()），
// 已建立的預留在標記當下釋放（見 lib/aftersales/repair-order-addon-actions.ts）。
export type CustomerSuppliedWaiverRole = "sa" | "customer";

export type CustomerSuppliedWaiver = {
  sa_signature_url: string | null;
  sa_signed_at: string | null;
  sa_signed_by: string | null;
  customer_signature_url: string | null;
  customer_signed_at: string | null;
  /** 雙方都簽署後鎖定，不可再修改「客戶自備料」標記或重新簽署 */
  locked: boolean;
  locked_at: string | null;
};

/** 零件品名附註後綴 — 對應規格「工單記錄：「{零件名稱}（客戶自備）」」 */
export const CUSTOMER_SUPPLIED_SUFFIX = "（客戶自備）";

export function isCustomerSupplied(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return Boolean(metadata?.customer_supplied);
}

export function getCustomerSuppliedWaiver(
  metadata: Record<string, unknown> | null | undefined,
): CustomerSuppliedWaiver | null {
  const raw = metadata?.customer_supplied_waiver;
  if (!raw || typeof raw !== "object") return null;
  return raw as CustomerSuppliedWaiver;
}

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

/**
 * 費用變動摘要（依工單彙整）
 * 對應 getAddonCostSummaryByRo(roId)
 */
export type AddonCostSummary = {
  /** 工單原始估價（repair_orders.estimated_total，可能為 null） */
  ro_estimated_total: number | null;
  /** 追加項目小計（全部 estimated_fee 加總，不限決策狀態） */
  addon_subtotal: number;
  /** 同意金額（customer_decision = 'agreed' 的加總） */
  agreed_subtotal: number;
  /** 預估總金額（若全部同意時；= ro_estimated_total + addon_subtotal） */
  projected_total: number | null;
  /** 各決策狀態件數 */
  counts: {
    pending: number;
    agreed: number;
    deferred: number;
    rejected: number;
    cancelled: number;
  };
};

// ── B-24：增項拒絕原因統計 + SA 轉化率
export type AddonRejectionStatRow = {
  reason: RejectionReason | "unknown";
  label: string;
  color: string;
  count: number;
  amount: number;
};

export type SaAddonConversionRow = {
  sa_name: string;
  total: number; // 已決策件數（agreed + deferred + rejected）
  accepted: number; // agreed
  rate: number; // accepted / total（%）
  top_reason: string | null; // 最高頻拒絕原因 label
};

/** SA 增項接受率健康線（CDK Global 2025）：≥35%🟢 / 20-34%🟡 / <20%🔴 */
export function saConversionColor(rate: number): string {
  if (rate >= 35) return "#0F6E56";
  if (rate >= 20) return "#854F0B";
  return "#CC0000";
}

// ── Labels（中文）
export const DECISION_LABEL: Record<CustomerDecision, string> = {
  pending: "待確認",
  agreed: "車主同意",
  deferred: "暫緩",
  rejected: "拒絕",
  cancelled: "已取消",
};

// ── 拒絕原因（B-23 / B-24）— 五選一固定標籤
export const REJECTION_REASON_LABEL: Record<RejectionReason, string> = {
  price: "💰 價格超出預算",
  time: "⏰ 今天時間不夠，下次再說",
  unnecessary: "❓ 不認為有必要做",
  consider: "🤔 需要回去考慮",
  other: "📝 其他",
};

/** 圓餅圖配色（B-24）— 以系統 amber 系為主，與失銷紅做出區隔 */
export const REJECTION_REASON_COLOR: Record<RejectionReason, string> = {
  price: "#CC0000",
  time: "#854F0B",
  unnecessary: "#6B7A8F",
  consider: "#B0AEA6",
  other: "#9A9890",
};

/** Modal radio 用的有序清單 */
export const REJECTION_REASON_OPTIONS: ReadonlyArray<{
  code: RejectionReason;
  label: string;
}> = [
  { code: "price", label: REJECTION_REASON_LABEL.price },
  { code: "time", label: REJECTION_REASON_LABEL.time },
  { code: "unnecessary", label: REJECTION_REASON_LABEL.unnecessary },
  { code: "consider", label: REJECTION_REASON_LABEL.consider },
  { code: "other", label: REJECTION_REASON_LABEL.other },
];

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

/**
 * Discount Approvals — client-safe constants & types
 *
 * 報價折扣超授權審核（RS_M5 折扣審核佇列 + RS_M3 代理審核人設定）
 *
 * 表：discount_approval_requests、discount_approval_backups
 * 業務規則讀自：business_rules.rule_kind='discount_authority'（config.max_overall_pct）
 *
 * 流程：業務員報價 → 折扣% 超授權上限 → 建 discount_approval_requests（status='pending'）
 *       → 通知主管審核 → approved/rejected → 業務員看到結果 → 得審核通過才能轉訂單
 */

// ─────────────────────────────────────────────────────────────
// Status
// ─────────────────────────────────────────────────────────────

export const DISCOUNT_APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "escalated",
  "expired",
] as const;
export type DiscountApprovalStatus = (typeof DISCOUNT_APPROVAL_STATUSES)[number];

export const DISCOUNT_APPROVAL_STATUS_LABELS: Record<DiscountApprovalStatus, string> = {
  pending: "待審核",
  approved: "已核准",
  rejected: "已駁回",
  escalated: "已升級",
  expired: "已逾時",
};

export const DISCOUNT_APPROVAL_STATUS_CHIP: Record<
  DiscountApprovalStatus,
  { bg: string; text: string }
> = {
  pending: { bg: "bg-[#FDF3E3]", text: "text-[#854F0B]" },
  approved: { bg: "bg-[#EAF3DE]", text: "text-[#3B6D11]" },
  rejected: { bg: "bg-[#FDECEA]", text: "text-[#CC0000]" },
  escalated: { bg: "bg-[#EAF4FB]", text: "text-[#185FA5]" },
  expired: { bg: "bg-[#F2F2F2]", text: "text-[#6B6A68]" },
};

// ─────────────────────────────────────────────────────────────
// Row types
// ─────────────────────────────────────────────────────────────

/** discount_approval_requests 主要欄位 */
export type DiscountApprovalRow = {
  id: string;
  brand_id: string;
  store_id: string | null;
  quote_id: string | null;
  order_id: string | null;
  requested_by: string | null;
  requested_at: string;
  discount_pct: number | null;
  discount_amount: number | null;
  in_store_waiting: boolean;
  status: DiscountApprovalStatus;
  deadline_at: string | null;
  approver_id: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  escalated_to: string | null;
  escalated_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  // joined（由 helper 補充，非 raw column）
  requester_name?: string | null;
  approver_name?: string | null;
  escalated_to_name?: string | null;
  quote_no?: string | null;
  vehicle_model_name?: string | null;
  vehicle_amount?: number | null;
};

/** discount_approval_backups — 代理審核人設定 */
export type DiscountApprovalBackupRow = {
  id: string;
  brand_id: string;
  store_id: string | null;
  manager_id: string;
  backup_approver_id: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  // joined
  manager_name?: string | null;
  backup_name?: string | null;
};

// ─────────────────────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────────────────────

export type CreateDiscountApprovalInput = {
  quote_id: string;
  discount_pct: number;
  discount_amount: number;
  in_store_waiting: boolean;
  /** 申請說明（業務員填） */
  notes?: string | null;
  vehicle_amount?: number | null;
  vehicle_model_name?: string | null;
};

export type DecideDiscountApprovalInput = {
  decision: "approved" | "rejected";
  reason?: string | null;
};

export type UpsertBackupApproverInput = {
  manager_id: string;
  backup_approver_id: string;
};

// ─────────────────────────────────────────────────────────────
// List filter
// ─────────────────────────────────────────────────────────────

export type ListDiscountApprovalsFilter = {
  status?: string;
  in_store_waiting?: boolean;
  /** 僅看自己送出的申請（業務員視角） */
  my_requests?: boolean;
  page?: number;
  pageSize?: number;
};

// ─────────────────────────────────────────────────────────────
// Authority check result（讀 business_rules 後的計算結果）
// ─────────────────────────────────────────────────────────────

export type DiscountAuthorityResult =
  | { within_authority: true; max_pct: number | null }
  | { within_authority: false; max_pct: number; approver_role_code: string | null };

// ─────────────────────────────────────────────────────────────
// Deadline 計算規則
// ─────────────────────────────────────────────────────────────

/** in_store_waiting=true → 10 分鐘；false → 30 分鐘 */
export const DEADLINE_MINUTES_IN_STORE = 10;
export const DEADLINE_MINUTES_NORMAL = 30;

export function calcDeadlineAt(inStoreWaiting: boolean, requestedAt?: Date): Date {
  const base = requestedAt ?? new Date();
  const minutes = inStoreWaiting ? DEADLINE_MINUTES_IN_STORE : DEADLINE_MINUTES_NORMAL;
  return new Date(base.getTime() + minutes * 60 * 1000);
}

/**
 * Discount Approvals — client-safe constants & types
 *
 * 折扣超授權審核（RS_M5 折扣審核佇列 + RS_M3 主管折扣門檻設定）
 *
 * 表：discount_approval_requests、discount_approval_backups
 * 業務規則讀自：business_rules.rule_kind='discount_authority'（config.max_overall_pct，scope_role_code 區分業務員/店長）
 *
 * RS04（2026-07-03 Russell 裁示）流程：
 *   報價階段完全不涉及折扣（業界共識，防止跨店比價）。
 *   業務員建立銷售訂單（輸入實際成交金額）才是折扣審核的唯一觸發點：
 *     情況A：在業務員授權內 → 訂單直接成立，車輛→已預訂
 *     情況B：超業務員授權、在店長授權內 → 訂單→待審核（pending_discount_approval），
 *            車輛→凍結；店長可批准 / 反價 / 拒絕
 *     exceeds_top：超過店長授權上限 → 無法送審，業務員需重新談判
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
  "counter_offered",
] as const;
export type DiscountApprovalStatus = (typeof DISCOUNT_APPROVAL_STATUSES)[number];

export const DISCOUNT_APPROVAL_STATUS_LABELS: Record<DiscountApprovalStatus, string> = {
  pending: "待審核",
  approved: "已核准",
  rejected: "已駁回",
  escalated: "已升級",
  expired: "已逾時",
  counter_offered: "已反價，待業務回覆",
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
  counter_offered: { bg: "bg-[#EEEDFE]", text: "text-[#534AB7]" },
};

/** 客戶對店長反價的回覆（業務員回報） */
export const CUSTOMER_RESPONSES = ["accepted", "rejected"] as const;
export type CustomerResponse = (typeof CUSTOMER_RESPONSES)[number];

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
  /** 店長反價金額 */
  counter_offer_amount: number | null;
  /** 店長反價對應折扣% */
  counter_offer_pct: number | null;
  counter_offered_at: string | null;
  /** 反價 24hr 逾時期限（RS04 新增機制） */
  counter_offer_deadline_at: string | null;
  /** 業務員回報客戶對反價的回應 */
  customer_response: CustomerResponse | null;
  customer_response_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  // joined（由 helper 補充，非 raw column）
  requester_name?: string | null;
  approver_name?: string | null;
  escalated_to_name?: string | null;
  quote_no?: string | null;
  order_no?: string | null;
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

/**
 * 建立折扣審核申請。quote_id / order_id 擇一必填。
 * RS04 後：正常業務流程只會用 order_id（報價階段不審折扣）；
 * quote_id 分支保留供歷史資料相容。
 */
export type CreateDiscountApprovalInput = {
  quote_id?: string | null;
  order_id?: string | null;
  discount_pct: number;
  discount_amount: number;
  in_store_waiting: boolean;
  /** 申請說明（業務員填） */
  notes?: string | null;
  vehicle_amount?: number | null;
  vehicle_model_name?: string | null;
};

export type DecideDiscountApprovalInput =
  | { decision: "approved"; reason?: string | null }
  | { decision: "rejected"; reason?: string | null }
  | {
      decision: "counter_offer";
      /** 店長反價可接受成交金額 */
      counter_offer_amount: number;
      /** 反價對應折扣% */
      counter_offer_pct: number;
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
// Authority check result（角色感知：讀 business_rules 後的兩層判斷）
// ─────────────────────────────────────────────────────────────

/**
 * situation A         = 在呼叫者自己（業務員或店長）授權範圍內，直接放行
 * situation B         = 超過呼叫者自己授權、但在上一層（店長）授權內 → 需送審
 * situation exceeds_top = 超過最高層（店長）授權上限 → 無法送審，需重新談判
 */
export type DiscountAuthorityResult =
  | {
      situation: "A";
      within_authority: true;
      /** 判斷時使用的呼叫者角色（scope_role_code），無對應規則時為 null（視為不限） */
      role_code: string | null;
      own_max_pct: number | null;
    }
  | {
      situation: "B";
      within_authority: false;
      role_code: string | null;
      own_max_pct: number | null;
      /** 上一層（通常是店長）授權上限 */
      top_max_pct: number;
      /** 需送審給誰（business_rules.config.approver_role_code） */
      approver_role_code: string | null;
    }
  | {
      situation: "exceeds_top";
      within_authority: false;
      role_code: string | null;
      own_max_pct: number | null;
      top_max_pct: number;
    };

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

/** 反價等待逾時（RS04 新增，預設 24 小時，可由 RS_M3 調整） */
export const COUNTER_OFFER_TIMEOUT_HOURS_DEFAULT = 24;

export function calcCounterOfferDeadlineAt(
  hours: number = COUNTER_OFFER_TIMEOUT_HOURS_DEFAULT,
  from?: Date,
): Date {
  const base = from ?? new Date();
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

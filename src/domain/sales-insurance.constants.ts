/**
 * Client-safe constants — Sales Insurance
 *
 * 純展示常數 / type，client component 從這裡 import；
 * server-only 的 query / mutation 留在 sales-insurance.ts。
 */

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ─── 業務 enums ─────────────────────────────────────
export type PolicyType = "compulsory" | "voluntary" | "theft" | "other";
export type PolicyStatus = "active" | "expired" | "cancelled" | "renewed" | "pending";
export type RenewalType =
  | "new_to_renew"
  | "renew_to_renew"
  | "lapsed_to_renew"
  | "external_to_renew"
  | "in_service_no_policy";
export type AttemptResult =
  | "contacted"
  | "no_answer"
  | "rescheduled"
  | "declined"
  | "closed"
  | "escalated";

export const POLICY_TYPE_LABEL: Record<PolicyType, string> = {
  compulsory: "強制險",
  voluntary: "任意險",
  theft: "竊盜險",
  other: "其他",
};

export const POLICY_STATUS_LABEL: Record<PolicyStatus, string> = {
  active: "在保中",
  pending: "招攬中",
  expired: "已過期未續",
  cancelled: "已取消",
  renewed: "已續保",
};

export const POLICY_STATUS_CHIP: Record<PolicyStatus, { bg: string; text: string }> = {
  active: { bg: "bg-[#EAF3DE]", text: "text-[#3B6D11]" },
  pending: { bg: "bg-[#FDF3E3]", text: "text-[#854F0B]" },
  expired: { bg: "bg-[#FDECEA]", text: "text-[#CC0000]" },
  cancelled: { bg: "bg-[#F2F2F2]", text: "text-[#6B6A68]" },
  renewed: { bg: "bg-[#EAF4FB]", text: "text-[#185FA5]" },
};

export const RENEWAL_TYPE_LABEL: Record<RenewalType, string> = {
  new_to_renew: "新轉續",
  renew_to_renew: "續轉續",
  lapsed_to_renew: "斷轉續",
  external_to_renew: "外轉續",
  in_service_no_policy: "在修未投保",
};

// ─── 列表 row 形狀 ──────────────────────────────────
export type InsurancePolicyRow = {
  id: string;
  brand_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  policy_no: string | null;
  insurer: string;
  policy_type: PolicyType;
  start_date: string | null;
  end_date: string;
  premium: number | null;
  status: PolicyStatus;
  renewal_type: RenewalType | null;
  renewal_reminded_at: string | null;
  assigned_to: string | null;
  call_count: number;
  last_called_at: string | null;
  next_action_date: string | null;
  lost_reason_code: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // joined
  customer_name: string | null;
  vehicle_plate: string | null;
  assigned_to_name: string | null;
  /** 距今天到期天數（正數=未到期、負數=已過期） */
  days_to_expiry: number;
};

export type InsuranceFilters = {
  status?: PolicyStatus | "all";
  policy_type?: PolicyType | "all";
  /** 到期區間預設值：0..30 / 0..60 / 0..90 / all */
  expiry_window?: "30" | "60" | "90" | "expired" | "all";
  search?: string;
  assigned_to?: string | "all";
};

// ─── KPI ────────────────────────────────────────────
export type InsuranceKpis = {
  expiring_this_month: number;
  expiring_30_days: number;
  active_count: number;
  expired_unrenewed: number;
  renewal_rate_pct: number;
  total_premium_this_month: number;
};

// ─── 到期 list buckets ──────────────────────────────
export type RenewalDueBucket = {
  window: "0-30" | "31-60" | "61-90";
  count: number;
  total_premium: number;
};

export type InsuranceTypeBreakdown = {
  policy_type: PolicyType;
  label: string;
  count: number;
};

export type InsuranceLookups = {
  customers: Array<{ id: string; name: string }>;
  vehicles: Array<{
    id: string;
    customer_id: string | null;
    license_plate: string | null;
    label: string;
  }>;
  employees: Array<{ id: string; name: string }>;
};

// ─── Mutation inputs ────────────────────────────────
export type CreatePolicyInput = {
  customer_id: string | null;
  vehicle_id: string | null;
  policy_no?: string | null;
  insurer: string;
  policy_type: PolicyType;
  start_date?: string | null;
  end_date: string;
  premium?: number | null;
  status?: PolicyStatus;
  renewal_type?: RenewalType | null;
  assigned_to?: string | null;
  notes?: string | null;
};

export type UpdatePolicyInput = Partial<CreatePolicyInput>;

export const INSURANCE_PAGE_SIZE_DEFAULT = 50;

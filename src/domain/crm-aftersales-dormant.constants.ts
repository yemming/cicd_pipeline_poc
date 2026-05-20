/**
 * 售後休眠流失管理 — client-safe types & labels（M02-6）
 *
 * 拆出來避免 client component import server-only helper（會拖入 next/headers cookies）。
 */

export type AftersalesDormancyStatus =
  | "active"
  | "dormant_60"
  | "dormant_120"
  | "dormant_180"
  | "lost";

export type AftersalesLostReason =
  | "maintenance_overdue"
  | "low_nps"
  | "warranty_expired"
  | "desmo_overdue"
  | "unreachable"
  | "other";

export const LOST_REASON_LABEL: Record<AftersalesLostReason, string> = {
  maintenance_overdue: "逾期保養",
  low_nps: "低 NPS",
  warranty_expired: "保固到期",
  desmo_overdue: "Desmo 超期",
  unreachable: "多次未接通",
  other: "其他",
};

export const DORMANCY_LABEL: Record<AftersalesDormancyStatus, string> = {
  active: "活躍中",
  dormant_60: "60 天內逾期",
  dormant_120: "60–120 天",
  dormant_180: "120 天以上",
  lost: "已流失",
};

export type AftersalesDormantRow = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  primary_license_plate: string | null;
  primary_model_name: string | null;
  vehicle_count: number;
  visit_count: number;
  last_visit_at: string | null;
  last_ro_no: string | null;
  days_overdue: number | null;
  dormancy_status: AftersalesDormancyStatus;
  assigned_sa_user_id: string | null;
  assigned_sa_name: string | null;
  lost_reason: AftersalesLostReason | null;
  lost_at: string | null;
};

export type AftersalesDormantKpi = {
  total_dormant: number;
  dormant_60: number;
  dormant_120: number;
  dormant_180: number;
  total_lost: number;
  lost_this_month: number;
  reactivated_this_month: number;
  reactivate_rate: number | null;
};

export type AftersalesDormantFilters = {
  status?: AftersalesDormancyStatus | "all";
  reason?: AftersalesLostReason | "all";
  search?: string;
};

export type SaAssigneeOption = {
  user_id: string;
  name: string;
};

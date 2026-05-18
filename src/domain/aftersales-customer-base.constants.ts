/**
 * Constants for 售後客戶基盤（/aftersales/crm/customer-base）
 *
 * Pure types & const enums — safe to import from client components.
 * Server-only domain helper 在 aftersales-customer-base.ts。
 */

export type AftersalesCustomerBaseFilters = {
  /** all | active_service | dormant | at_risk */
  service_status: string;
  /** all | individual | corporate */
  type: string;
  /** code / name / phone / tax_id / license_plate */
  q: string;
};

/**
 * 售後服務狀態 — 由 next_service_due_date / last_service_date 推導
 *  - active_service：未來 90 天內有預定保養（健康）
 *  - at_risk      ：已過保養到期日 ≤ 60 天（追回廠）
 *  - dormant      ：超過 6 個月沒回廠（流失邊緣）
 */
export type AftersalesServiceStatus =
  | "active_service"
  | "at_risk"
  | "dormant"
  | "unknown";

export const SERVICE_STATUS_LABEL: Record<AftersalesServiceStatus, string> = {
  active_service: "服務中",
  at_risk: "待回廠",
  dormant: "流失邊緣",
  unknown: "尚未進廠",
};

// ──────────────────────────────────────────────────────────────────────────
// CRM Board view（client-safe types）
// ──────────────────────────────────────────────────────────────────────────

/** 紅綠燈：紅=逾期未回廠 / 黃=30 天內到期保養 / 綠=正常或新客 */
export type AftersalesCustomerTraffic = "red" | "amber" | "green";

export type AftersalesCustomerCrmRow = {
  // 基本（與 board row 共用）
  id: string;
  code: string;
  name: string;
  type: "individual" | "corporate";
  phone: string | null;
  email: string | null;
  is_active: boolean;
  avatar_url: string | null;
  primary_license_plate: string | null;
  primary_mileage: number | null;
  vehicle_count: number;
  visit_count: number;
  last_visit_at: string | null;
  last_ro_no: string | null;
  next_due_date: string | null;
  // CRM 視角追加
  traffic: AftersalesCustomerTraffic;
  service_status: AftersalesServiceStatus;
  /** 距下次保養（負值代表已逾期；null = 無資料） */
  days_until_next_due: number | null;
  /** 距 Desmo Service 到期（負值代表已逾期；null = 無資料） */
  days_until_desmo: number | null;
  desmo_due_date: string | null;
  warranty_until: string | null;
  warranty_days_left: number | null;
  source_module: string | null;
  /** display string，例：'RS05 同步' / '自行進廠' / 'SA 自建' */
  source_label: string;
  source_badge: "rs05" | "walk" | "sa";
  assigned_sa_name: string | null;
  primary_model_name: string | null;
  primary_year: number | null;
};

export type AftersalesCustomerCrmKpi = {
  total: number;
  overdue: number;
  due_soon: number;
  this_month_visits: number;
  rs05_synced: number;
};

export type AftersalesCustomerCrmFilters = {
  /** all | overdue | due_soon | warranty_soon | desmo_soon | high_spend | rs05 */
  quick: string;
  /** all | rs05 | walk | sa */
  source: string;
  /** all | active_service | at_risk | dormant | new */
  status: string;
  /** keyword：name / phone / plate */
  q: string;
};

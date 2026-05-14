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

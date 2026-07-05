/**
 * Sales Orders — client-safe constants & types
 * contract_type / payment_method / status enum + label maps
 * Row types 放這裡讓 client component 安全 import（不帶 server-only）
 */

// ─────────────────────────────────────────────────────────────
// Row types（client-safe — 純資料結構，無 supabase 呼叫）
// ─────────────────────────────────────────────────────────────

export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type SalesOrderRow = {
  id: string;
  brand_id: string;
  order_no: string;
  contract_type: "new" | "used";
  status: "draft" | "submitted" | "signed" | "cancelled" | "fulfilled" | "pending_discount_approval";
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  rs_name: string | null;
  vehicle_model_name: string | null;
  used_brand_model: string | null;
  payment_method: string | null;
  total_amount: number | null;
  deal_price: number | null;
  down_payment: number | null;
  delivery_date: string | null;
  submitted_at: string | null;
  signed_at: string | null;
  fulfilled_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // join fields
  customer_code?: string | null;
};

export type SalesOrderDetail = SalesOrderRow & {
  customer_email: string | null;
  customer_address: string | null;
  buyer_national_id: string | null;
  lead_id: string | null;
  vehicle_model_id: string | null;
  vehicle_color: string | null;
  vehicle_vin: string | null;
  vehicle_engine_no: string | null;
  used_vehicle_id: string | null;
  used_year: string | null;
  used_plate: string | null;
  used_cc: string | null;
  used_mileage: string | null;
  used_cert_level: string | null;
  final_payment_date: string | null;
  transfer_by: string | null;
  special_notes: string | null;
  condition_notes: string | null;
  quote_snapshot: Record<string, unknown> | null;
  signature_buyer: string | null;
  signature_seller: string | null;
  signature_witness: string | null;
  metadata: Record<string, unknown>;
  updated_by: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  // B1 schema 新欄位（RS04 Stage 1）
  cancel_requested_at: string | null;
  cancel_reason_code: string | null;
  cancel_within_review_period: boolean | null;
  cancel_forfeit_rate: number | null;
  cancel_forfeit_reason: string | null;
  review_period_days: number | null;
  review_expires_at: string | null;
  dispute_frozen: boolean | null;
  dispute_frozen_reason: string | null;
  financing_status: string | null;
  financing_applied_at: string | null;
  reassigned_from: string | null;
  reassigned_to: string | null;
  reassigned_at: string | null;
  negative_equity_resolution: string | null;
  trade_in_linked_order_id: string | null;
  new_vehicle_id: string | null;
  insurance_company: string | null;
  insurance_policy_no: string | null;
  insurance_until: string | null;
  contract_locked: boolean | null;
  // RS04 折扣管控（2026-07-03 Russell 裁示）
  list_price: number | null;
  discount_pct: number | null;
  discount_amount: number | null;
};

export type CreateSalesOrderInput = {
  contract_type: "new" | "used";
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_address?: string | null;
  buyer_national_id?: string | null;
  rs_name?: string | null;
  lead_id?: string | null;
  // 新車
  vehicle_model_id?: string | null;
  vehicle_model_name?: string | null;
  vehicle_color?: string | null;
  vehicle_vin?: string | null;
  vehicle_engine_no?: string | null;
  /** 新車庫存 ID（B-3 新車二賣鎖用）— 簽約時寫入、取消時清掉 */
  new_vehicle_id?: string | null;
  // 中古車
  used_vehicle_id?: string | null;
  used_brand_model?: string | null;
  used_year?: string | null;
  used_plate?: string | null;
  used_cc?: string | null;
  used_mileage?: string | null;
  used_cert_level?: string | null;
  // 付款
  payment_method?: string | null;
  total_amount?: number | null;
  down_payment?: number | null;
  deal_price?: number | null;
  delivery_date?: string | null;
  final_payment_date?: string | null;
  transfer_by?: string | null;
  // RS04 折扣管控 — 定價（list_price）與成交價（deal_price/total_amount）的差 = 折扣
  /** 建議售價（車輛未折扣前的定價）。有值才會觸發折扣授權判斷 */
  list_price?: number | null;
  /** 送審時客戶是否在場（決定審核逾時 10 分鐘 vs 30 分鐘），預設 true */
  in_store_waiting?: boolean | null;
  // 其他
  special_notes?: string | null;
  condition_notes?: string | null;
  quote_snapshot?: Record<string, unknown> | null;
  // 以舊換新 / 負值差價
  /** 負值差價處理方式（trade_in_balance < 0 時必填） */
  negative_equity_resolution?: "rolled_into_price" | "cash_topup" | null;
  /** 以舊換新：收購訂單 ID，用以回填 trade_in_linked_order_id */
  trade_in_linked_order_id?: string | null;
  // 融資
  financing_status?: "not_applicable" | "pending_approval" | "approved" | "rejected" | null;
  financing_applied_at?: string | null;
};

export type UpdateSalesOrderInput = Partial<CreateSalesOrderInput> & {
  status?: "draft" | "submitted" | "signed" | "cancelled" | "fulfilled";
  signature_buyer?: string | null;
  signature_seller?: string | null;
  signature_witness?: string | null;
  signed_at?: string | null;
  fulfilled_at?: string | null;
};

export type ListSalesOrdersFilter = {
  status?: string;
  contract_type?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

export type CustomerPickRow = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
};

export type VehicleModelPickRow = {
  id: string;
  model_name: string;
  display_name: string;
};

export const CONTRACT_TYPES = ["new", "used"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  new: "新車訂購合約",
  used: "中古車買賣合約",
};

export const ORDER_STATUSES = [
  "draft",
  "submitted",
  "signed",
  "cancelled",
  "fulfilled",
  "pending_discount_approval",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "草稿",
  submitted: "送簽中",
  signed: "已簽約",
  cancelled: "已作廢",
  fulfilled: "已交車",
  pending_discount_approval: "待折扣審核",
};

export const ORDER_STATUS_CHIP: Record<
  OrderStatus,
  { bg: string; text: string }
> = {
  draft: { bg: "bg-[#F2F2F2]", text: "text-[#6B6A68]" },
  submitted: { bg: "bg-[#FDF3E3]", text: "text-[#854F0B]" },
  signed: { bg: "bg-[#EAF4FB]", text: "text-[#185FA5]" },
  cancelled: { bg: "bg-[#FDECEA]", text: "text-[#CC0000]" },
  fulfilled: { bg: "bg-[#EAF3DE]", text: "text-[#3B6D11]" },
  pending_discount_approval: { bg: "bg-[#EEEDFE]", text: "text-[#534AB7]" },
};

export const PAYMENT_METHODS = ["cash", "card", "loan", "installment"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "現金全額",
  card: "刷卡一次",
  loan: "銀行貸款",
  installment: "分期付款",
};

export const USED_CERT_LEVELS = [
  "CPO 原廠認證",
  "DPO 經銷商認證",
  "PO 一般中古",
] as const;
export type UsedCertLevel = (typeof USED_CERT_LEVELS)[number];

export const TRANSFER_OPTIONS = ["本店代辦", "買受人自行辦理"] as const;

// ─────────────────────────────────────────────────────────────
// RS04 取消/退車 types（輪10, Stage 1）
// ─────────────────────────────────────────────────────────────

/** 取消原因代碼（對應 DB CHECK constraint） */
export const CANCEL_REASON_CODES = [
  "price",
  "family_objection",
  "funding_shortfall",
  "financing_rejected",
  "switched_brand",
  "other",
] as const;
export type CancelReasonCode = (typeof CANCEL_REASON_CODES)[number];

export const CANCEL_REASON_LABELS: Record<CancelReasonCode, string> = {
  price: "價格因素",
  family_objection: "家人反對",
  funding_shortfall: "資金不足",
  financing_rejected: "貸款未過件",
  switched_brand: "改購其他品牌",
  other: "其他原因",
};

/**
 * 審閱期天數 hardcode 預設（可由 business_rules 覆寫）
 * 新車 3 天、中古車 2 天
 */
export const REVIEW_PERIOD_DAYS: Record<"new" | "used", number> = {
  new: 3,
  used: 2,
};

/** RS04⑦ 換車門檻（佔位；待法律顧問確認後 seed business_rules） */
export type ReplaceCarThresholds = {
  /** 換車申請截止天數（自交車日起算） */
  max_days_after_delivery: number;
  /** 換車申請截止里程（km，0 = 不設上限） */
  max_km_at_application: number;
};
export const REPLACE_CAR_THRESHOLDS_PLACEHOLDER: ReplaceCarThresholds = {
  max_days_after_delivery: 0,  // 0 = 待設定（律師確認前不鎖）
  max_km_at_application: 0,
};

/** 取消動作輸入（結構化取消 + 審閱期判斷） */
export type CancelOrderInput = {
  reason_code: CancelReasonCode;
  /** 期後裁量沒收比例 0~10（百分比），審閱期內系統強制 0 不用傳 */
  forfeit_rate?: number | null;
  /** 沒收說明（forfeit_rate > 0 時必填） */
  forfeit_reason?: string | null;
};

/** RS04③ 延期/無法交車輸入 */
export type DeferDeliveryInput = {
  /** 'deferred' = 展期可繼續等；'unable' = 廠方無法交車需協商 */
  resolution: "deferred" | "unable";
  new_delivery_date?: string | null;
  reason: string;
};

/** RS04⑥ 中古車交車後爭議 */
export type UsedCarPostDeliveryDisputeInput = {
  reason: string;
  detail?: string | null;
};

/** RS04⑦ 新車換車申請 */
export type ReplaceNewCarInput = {
  reason: string;
  replacement_vehicle_id?: string | null;
  detail?: string | null;
};

// ─────────────────────────────────────────────────────────────
// 訂單 detail 擴充（含 B1 schema 新欄位）
// ─────────────────────────────────────────────────────────────

/** SalesOrderDetail 的 Stage 1 擴充欄位（從 DB 讀取） */
export type SalesOrderCancelFields = {
  cancel_requested_at: string | null;
  cancel_reason_code: CancelReasonCode | null;
  cancel_within_review_period: boolean | null;
  cancel_forfeit_rate: number | null;
  cancel_forfeit_reason: string | null;
  review_period_days: number | null;
  review_expires_at: string | null;
  dispute_frozen: boolean | null;
  dispute_frozen_reason: string | null;
  financing_status: "not_applicable" | "pending_approval" | "approved" | "rejected" | null;
  financing_applied_at: string | null;
  reassigned_from: string | null;
  reassigned_to: string | null;
  reassigned_at: string | null;
  negative_equity_resolution: "rolled_into_price" | "cash_topup" | null;
  trade_in_linked_order_id: string | null;
  new_vehicle_id: string | null;
  insurance_company: string | null;
  insurance_policy_no: string | null;
  insurance_until: string | null;
  contract_locked: boolean | null;
};

// ─────────────────────────────────────────────────────────────
// A-6 融資狀態（financing_status）
// ─────────────────────────────────────────────────────────────

export const FINANCING_STATUSES = [
  "not_applicable",
  "pending_approval",
  "approved",
  "rejected",
] as const;
export type FinancingStatus = (typeof FINANCING_STATUSES)[number];

export const FINANCING_STATUS_LABELS: Record<FinancingStatus, string> = {
  not_applicable: "不適用",
  pending_approval: "審核中",
  approved: "已通過",
  rejected: "已拒絕",
};

export const FINANCING_STATUS_CHIP: Record<FinancingStatus, { bg: string; text: string }> = {
  not_applicable: { bg: "bg-[#F2F2F2]", text: "text-[#6B6A68]" },
  pending_approval: { bg: "bg-[#FDF3E3]", text: "text-[#854F0B]" },
  approved: { bg: "bg-[#EAF3DE]", text: "text-[#3B6D11]" },
  rejected: { bg: "bg-[#FDECEA]", text: "text-[#CC0000]" },
};

/** A-6 融資狀態更新 input */
export type UpdateFinancingInput = {
  financing_status: FinancingStatus;
};

// ─────────────────────────────────────────────────────────────
// A-9 業務員轉移 input
// ─────────────────────────────────────────────────────────────

export type ReassignOrderInput = {
  /** 接手業務員姓名（rs_name 更新目標） */
  new_rs_name: string;
  /** 轉移原因說明（audit_log） */
  reason?: string | null;
};

// ─────────────────────────────────────────────────────────────
// 金流 Wiring input（輪5-9）
// ─────────────────────────────────────────────────────────────

export type RecordOrderPaymentInput = {
  /** 付款方式（決定 settlement_status） */
  payment_method: string;
  /** 訂金金額（正值） */
  down_payment?: number | null;
  /** 以舊換新時的舊車收購金額（正值）→ 三筆分拆 */
  trade_in_price?: number | null;
};

// ─────────────────────────────────────────────────────────────
// KPI / Funnel types — A 級升級 client-safe（M01-8, 2026-05-20）
// ─────────────────────────────────────────────────────────────

export type SalesOrderKpis = {
  monthly_count: number;
  monthly_amount: number;
  pending_delivery_count: number;
  fulfilled_this_month: number;
  pending_approval_count: number;
};

export type SalesOrderStatusBreakdown = {
  status: OrderStatus;
  count: number;
};

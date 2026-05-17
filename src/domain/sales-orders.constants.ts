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
  status: "draft" | "submitted" | "signed" | "cancelled" | "fulfilled";
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
  // 其他
  special_notes?: string | null;
  condition_notes?: string | null;
  quote_snapshot?: Record<string, unknown> | null;
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

export const ORDER_STATUSES = ["draft", "submitted", "signed", "cancelled", "fulfilled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "草稿",
  submitted: "送簽中",
  signed: "已簽約",
  cancelled: "已作廢",
  fulfilled: "已交車",
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

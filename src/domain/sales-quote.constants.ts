/**
 * Sales Quotes — client-safe constants & types
 *
 * 賞車報價單（RS04-quote）— 成交前的報價，成交後 → sales_orders
 *
 * 客戶賞車 → 業務開報價單 → 等客戶決定 → 成交 (won) → 建合約
 */

// ─────────────────────────────────────────────────────────────
// Result envelope（同 sales-orders.constants）
// ─────────────────────────────────────────────────────────────

export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────

export const QUOTE_STATUSES = ["open", "sent", "won", "lost", "expired"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  open: "草稿",
  sent: "已傳送",
  won: "成交",
  lost: "未成交",
  expired: "已過期",
};

export const QUOTE_STATUS_CHIP: Record<
  QuoteStatus,
  { bg: string; text: string }
> = {
  open: { bg: "bg-[#F2F2F2]", text: "text-[#6B6A68]" },
  sent: { bg: "bg-[#EAF4FB]", text: "text-[#185FA5]" },
  won: { bg: "bg-[#EAF3DE]", text: "text-[#3B6D11]" },
  lost: { bg: "bg-[#FDECEA]", text: "text-[#CC0000]" },
  expired: { bg: "bg-[#FDF3E3]", text: "text-[#854F0B]" },
};

export const VEHICLE_KINDS = ["new", "used"] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

export const VEHICLE_KIND_LABELS: Record<VehicleKind, string> = {
  new: "新車",
  used: "中古車",
};

// ─────────────────────────────────────────────────────────────
// Row types
// ─────────────────────────────────────────────────────────────

export type QuoteLineCategory =
  | "vehicle"
  | "gift"
  | "addon"
  | "insurance"
  | "license"
  | "discount";

export type QuoteLine = {
  id: string;
  category: QuoteLineCategory;
  name: string;
  note?: string | null;
  listPrice: number | null;
  quotePrice: number;
  isGift?: boolean;
};

export type SalesQuoteRow = {
  id: string;
  brand_id: string;
  quote_no: string;
  vehicle_kind: VehicleKind;
  status: QuoteStatus;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  rs_name: string | null;
  vehicle_model_id: string | null;
  vehicle_model_name: string | null;
  used_brand_model: string | null;
  vehicle_amount: number;
  addon_amount: number;
  discount_amount: number;
  total_amount: number;
  expires_at: string | null;
  sent_at: string | null;
  closed_at: string | null;
  estimated_delivery_date: string | null;
  converted_order_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SalesQuoteDetail = SalesQuoteRow & {
  lines: QuoteLine[];
  metadata: Record<string, unknown>;
};

export type CreateSalesQuoteInput = {
  vehicle_kind: VehicleKind;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  rs_name?: string | null;
  vehicle_model_id?: string | null;
  vehicle_model_name?: string | null;
  used_brand_model?: string | null;
  vehicle_amount?: number;
  addon_amount?: number;
  discount_amount?: number;
  total_amount?: number;
  lines?: QuoteLine[];
  expires_at?: string | null;
  estimated_delivery_date?: string | null;
  notes?: string | null;
};

export type UpdateSalesQuoteInput = Partial<CreateSalesQuoteInput> & {
  status?: QuoteStatus;
};

export type ListSalesQuotesFilter = {
  status?: string;
  vehicle_kind?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

// ─────────────────────────────────────────────────────────────
// KPI / aggregate
// ─────────────────────────────────────────────────────────────

export type QuoteKpis = {
  /** 本月開立的報價單數（建立日期在本月） */
  monthly_count: number;
  /** 本月開立報價的總金額 */
  monthly_amount: number;
  /** 待簽約：status in ('open','sent') */
  pending_count: number;
  /** 30 天內過期 */
  expiring_30_days: number;
  /** 本月轉換率（成交 / (成交 + 流失 + 過期)） */
  conversion_rate_pct: number;
};

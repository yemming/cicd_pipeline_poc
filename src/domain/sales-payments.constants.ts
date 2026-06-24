/**
 * Sales Payments — client-safe constants & types
 * B1 schema: sales_payments 表 — 銷售金流帳冊
 *
 * 注意：本檔純型別 + enum，無 supabase 呼叫，client component 可安全 import。
 */

// ─────────────────────────────────────────────────────────────
// Result 型別（與其他 domain helper 統一）
// ─────────────────────────────────────────────────────────────

export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// Enum: source_type（DB CHECK constraint 6 值）
// ─────────────────────────────────────────────────────────────

export const PAYMENT_SOURCE_TYPES = [
  "new_vehicle_sale",       // 新車銷售收款（正值）
  "used_vehicle_sale",      // 中古車銷售收款（正值）
  "trade_in_balance",       // 以舊換新差額（正值）
  "trade_in_acquisition",   // 以舊換新收購（負值，公司付款給客戶）
  "pure_purchase",          // 純收購中古車（負值）
  "wholesale_to_external",  // 批售給外部買家（正值）
] as const;
export type PaymentSourceType = (typeof PAYMENT_SOURCE_TYPES)[number];

export const PAYMENT_SOURCE_TYPE_LABELS: Record<PaymentSourceType, string> = {
  new_vehicle_sale: "新車銷售",
  used_vehicle_sale: "中古車銷售",
  trade_in_balance: "以舊換新差額",
  trade_in_acquisition: "以舊換新收購",
  pure_purchase: "純收購",
  wholesale_to_external: "外部批售",
};

// ─────────────────────────────────────────────────────────────
// Enum: payment_status（DB CHECK constraint 2 值）
// ─────────────────────────────────────────────────────────────

export const PAYMENT_STATUSES = [
  "recorded_payable", // 已記錄應付（尚未實際付款）
  "paid",             // 已付款
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  recorded_payable: "應付款中",
  paid: "已付款",
};

export const PAYMENT_STATUS_CHIP: Record<PaymentStatus, { bg: string; text: string }> = {
  recorded_payable: { bg: "bg-[#FDF3E3]", text: "text-[#854F0B]" },
  paid: { bg: "bg-[#EAF3DE]", text: "text-[#3B6D11]" },
};

// ─────────────────────────────────────────────────────────────
// Enum: settlement_status（DB CHECK constraint 2 值）
// A-8 規則：轉帳 → pending_settlement；現金/刷卡 → settled
// ─────────────────────────────────────────────────────────────

export const SETTLEMENT_STATUSES = [
  "pending_settlement", // 待結算（轉帳類預設）
  "settled",            // 已結算（現金/刷卡預設）
] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  pending_settlement: "待結算",
  settled: "已結算",
};

export const SETTLEMENT_STATUS_CHIP: Record<SettlementStatus, { bg: string; text: string }> = {
  pending_settlement: { bg: "bg-[#EAF4FB]", text: "text-[#185FA5]" },
  settled: { bg: "bg-[#EAF3DE]", text: "text-[#3B6D11]" },
};

// ─────────────────────────────────────────────────────────────
// Row type（對應 DB 欄位）
// ─────────────────────────────────────────────────────────────

export type SalesPaymentRow = {
  id: string;
  brand_id: string;
  order_id: string | null;
  order_no: string;
  source_type: PaymentSourceType;
  total_amount: number;  // 正值=收款，負值=付款（收購/以舊換新）
  payment_method: string;
  payment_status: PaymentStatus;
  settlement_status: SettlementStatus;
  paid_at: string;       // ISO timestamptz
  store_id: string | null;
  created_by: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────────────────────

export type CreateSalesPaymentInput = {
  order_id?: string | null;
  order_no: string;
  source_type: PaymentSourceType;
  total_amount: number;
  payment_method: string;
  payment_status?: PaymentStatus;
  settlement_status?: SettlementStatus;
  paid_at?: string;
  store_id?: string | null;
  metadata?: Record<string, unknown>;
};

export type ListSalesPaymentsFilter = {
  order_id?: string;
  source_type?: PaymentSourceType;
  payment_status?: PaymentStatus;
  settlement_status?: SettlementStatus;
  page?: number;
  pageSize?: number;
};

// ─────────────────────────────────────────────────────────────
// 以舊換新三筆分拆 input
// ─────────────────────────────────────────────────────────────

export type TradeInSplitInput = {
  /** 關聯的新車訂單 ID */
  orderId: string;
  /** 訂單號（同時給三筆用） */
  orderNo: string;
  /** 新車售價（正值）→ new_vehicle_sale */
  newVehiclePrice: number;
  /** 舊車收購價（正值，內部會轉負值）→ trade_in_acquisition */
  tradeInPrice: number;
  /** 付款方式（給新車那筆用；收購那筆固定轉帳） */
  paymentMethod: string;
  /** 額外 metadata（可選） */
  metadata?: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────────────
// 批售給外部買家 input
// ─────────────────────────────────────────────────────────────

export type WholesaleToExternalInput = {
  order_id?: string | null;
  order_no: string;
  total_amount: number;
  payment_method: string;
  paid_at?: string;
  metadata?: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────────────
// 純收購中古車 input
// ─────────────────────────────────────────────────────────────

export type PurePurchaseInput = {
  order_id?: string | null;
  order_no: string;
  /** 收購金額（正值，內部自動轉負值） */
  purchase_amount: number;
  payment_method: string;
  paid_at?: string;
  metadata?: Record<string, unknown>;
};

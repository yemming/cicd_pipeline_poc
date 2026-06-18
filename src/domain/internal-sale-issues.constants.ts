/**
 * Internal Sale Issue（內售出庫）— constants & formatters
 *
 * 規格來源：Notion BDN §Phase 2 · Batch M04U · M04U-20
 *  - UI Detail 加門店選擇 placeholder map + 配送 ETA 變量 + 頂 KpiCard
 *  - 對應 stock_issues.type='internal_sale'
 *
 * 這支是 plain constants（非 "use server"），可被 client component 直接 import。
 */

import type { ToneKey } from "@/components/visualization/tone";

// ─────────────────────────────────────────────────────────────
// 單據主狀態（沿用 stock_issues.status：completed / cancelled / draft）
// ─────────────────────────────────────────────────────────────
export type InternalSaleIssueStatus = "draft" | "completed" | "cancelled";

export const ISSUE_STATUS_OPTIONS: ReadonlyArray<{
  value: InternalSaleIssueStatus | "all";
  label: string;
}> = [
  { value: "all", label: "全部" },
  { value: "completed", label: "已過帳" },
  { value: "cancelled", label: "已作廢" },
];

export function issueStatusLabel(s: string | null | undefined): string {
  switch (s) {
    case "draft":
      return "草稿";
    case "completed":
      return "已過帳";
    case "cancelled":
      return "已作廢";
    default:
      return s ?? "—";
  }
}

export function issueStatusChipClass(s: string | null | undefined): string {
  switch (s) {
    case "draft":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "completed":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    case "cancelled":
      return "bg-[#FDECEA] text-[#CC0000]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

// ─────────────────────────────────────────────────────────────
// 配送狀態（M04U-20 新增）
// ─────────────────────────────────────────────────────────────
export type DeliveryStatus = "pending" | "in_transit" | "delivered" | "cancelled";

export const DELIVERY_STATUS_OPTIONS: ReadonlyArray<{
  value: DeliveryStatus | "all";
  label: string;
}> = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待出貨" },
  { value: "in_transit", label: "查收中" },
  { value: "delivered", label: "已送達" },
  { value: "cancelled", label: "已取消" },
];

export function deliveryStatusLabel(s: string | null | undefined): string {
  switch (s) {
    case "pending":
      return "待出貨";
    case "in_transit":
      return "查收中";
    case "delivered":
      return "已送達";
    case "cancelled":
      return "已取消";
    default:
      return "未指定";
  }
}

export function deliveryStatusChipClass(s: string | null | undefined): string {
  switch (s) {
    case "pending":
      return "bg-tone-amber-50 text-tone-amber-700 border border-tone-amber-100";
    case "in_transit":
      return "bg-tone-blue-50 text-tone-blue-700 border border-tone-blue-100";
    case "delivered":
      return "bg-tone-green-50 text-tone-green-700 border border-tone-green-100";
    case "cancelled":
      return "bg-tone-red-50 text-tone-red-700 border border-tone-red-100";
    default:
      return "bg-tone-gray-50 text-tone-gray-500 border border-tone-gray-100";
  }
}

export function deliveryStatusTone(s: string | null | undefined): ToneKey {
  switch (s) {
    case "pending":
      return "amber";
    case "in_transit":
      return "blue";
    case "delivered":
      return "green";
    case "cancelled":
      return "red";
    default:
      return "gray";
  }
}

// ─────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────
export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `NT$ ${Math.round(Number(n)).toLocaleString("en-US")}`;
}

export function fmtMoneyShort(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(0)}K`;
  return v.toLocaleString("en-US");
}

export function fmtDate(d: string | null | undefined): string {
  return d ? d.replace(/-/g, "/") : "—";
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

/**
 * ETA 距離當前時間的人類可讀差值
 *  - 過去 → "已超時 Xh"
 *  - 未來 < 1h → "Xmin 內"
 *  - 未來 < 24h → "Xh 後"
 *  - 否則 → "Xd 後"
 */
export function fmtEtaDelta(eta: string | null | undefined): string {
  if (!eta) return "未排定";
  const dt = new Date(eta).getTime();
  if (Number.isNaN(dt)) return "—";
  const diffMs = dt - Date.now();
  const absMin = Math.round(Math.abs(diffMs) / 60000);
  if (diffMs < 0) {
    if (absMin < 60) return `已超時 ${absMin} 分`;
    if (absMin < 24 * 60) return `已超時 ${Math.round(absMin / 60)} 小時`;
    return `已超時 ${Math.round(absMin / 60 / 24)} 天`;
  }
  if (absMin < 60) return `${absMin} 分內`;
  if (absMin < 24 * 60) return `${Math.round(absMin / 60)} 小時後`;
  return `${Math.round(absMin / 60 / 24)} 天後`;
}

// ─────────────────────────────────────────────────────────────
// 應收帳款（Accounts Receivable）— 收款狀態相關
// ─────────────────────────────────────────────────────────────

/**
 * 預設帳期天數：內售出庫後幾天視為「應收到款」。
 * 沒有設定 metadata.expected_payment_date 時，用 issue_date + 這個天數推算。
 * 調整此常數即可全站生效，不需改商業邏輯。
 */
export const DEFAULT_PAYMENT_TERMS_DAYS = 30;

/**
 * 逾期分級門檻（天）：
 *  - overdueDays <= OVERDUE_WARN_DAYS  → 輕度逾期（normal — 仍用紅色顯示但無需升級）
 *  - overdueDays >  OVERDUE_WARN_DAYS  → 嚴重逾期（升級 — 未來可加告警、深紅底）
 * POC 阶段兩者都用同一紅色 chip，門檻值先定義以便後續擴充。
 */
export const OVERDUE_WARN_DAYS = 30;

/** 應收收款狀態 */
export type PaymentStatus = "received" | "unpaid" | "overdue";

export const PAYMENT_STATUS_OPTIONS: ReadonlyArray<{
  value: PaymentStatus | "all";
  label: string;
}> = [
  { value: "all", label: "全部" },
  { value: "unpaid", label: "未收款" },
  { value: "overdue", label: "逾期未收款" },
  { value: "received", label: "已收款" },
];

export function paymentStatusLabel(s: PaymentStatus | null | undefined): string {
  switch (s) {
    case "received":
      return "已收款";
    case "unpaid":
      return "未收款";
    case "overdue":
      return "逾期未收款";
    default:
      return "—";
  }
}

/**
 * 依 CLAUDE.md §Design Tokens：
 *  - 已收款 → 啟用綠 bg-[#EAF3DE] text-[#3B6D11]
 *  - 未收款 → 停用灰 bg-[#F2F2F2] text-[#6B6A68]
 *  - 逾期未收款 → 危險紅 bg-[#FDECEA] text-[#CC0000]
 */
export function paymentStatusChipClass(s: PaymentStatus | null | undefined): string {
  switch (s) {
    case "received":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    case "unpaid":
      return "bg-[#F2F2F2] text-[#6B6A68]";
    case "overdue":
      return "bg-[#FDECEA] text-[#CC0000]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

/**
 * 計算一筆 row 的應收狀態。
 *
 * 規則：
 * 1. 若 metadata.payment_received === true → "received"
 * 2. 若 amount_total <= 0 → 視為不適用（回 null，呼叫端自行決定展示）
 * 3. 計算 expected_payment_date（metadata 有就用，否則 issue_date + DEFAULT_PAYMENT_TERMS_DAYS）
 * 4. expected_payment_date < today → "overdue"，否則 "unpaid"
 */
export function resolvePaymentStatus(
  issueStatus: string | null | undefined,
  amountTotal: number,
  issueDate: string,
  meta: Record<string, unknown>,
  today: string,
): PaymentStatus | null {
  // 已作廢不計應收
  if (issueStatus === "cancelled" || issueStatus === "voided") return null;
  // 金額為零不計應收
  if (amountTotal <= 0) return null;

  if (meta.payment_received === true) return "received";

  // 計算預期收款日
  const expectedDate =
    typeof meta.expected_payment_date === "string" && meta.expected_payment_date.length === 10
      ? meta.expected_payment_date
      : offsetDate(issueDate, DEFAULT_PAYMENT_TERMS_DAYS);

  return expectedDate < today ? "overdue" : "unpaid";
}

/** 日期字串（YYYY-MM-DD）加 n 天，回傳 YYYY-MM-DD */
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────
// estimateDeliveryEta — 配送 ETA 估算（POC 版：常數規則）
// 真實版會接 Google Maps Distance Matrix；POC 用「同店 4h、跨市 +8h」常數
// ─────────────────────────────────────────────────────────────
export type EtaEstimateInput = {
  warehouse_code?: string | null;
  destination_store_code?: string | null;
  /** 預設 now()；測試可注入固定時間 */
  base_time?: Date;
};

export function estimateDeliveryEta(input: EtaEstimateInput): {
  eta_at: string; // ISO
  hours: number;
  rule: string;
} {
  const base = input.base_time ?? new Date();
  const wh = (input.warehouse_code ?? "").toUpperCase();
  const dest = (input.destination_store_code ?? "").toUpperCase();

  // POC 規則：
  //  1. 沒指定 dest → 4h（同倉自取）
  //  2. dest 包含相同城市 token（TAIPEI / KH / NEIHU / XINYI）→ 6h（市內配送）
  //  3. 跨市 → 24h
  let hours = 4;
  let rule = "default";
  if (dest) {
    const tokens = ["TAIPEI", "NEIHU", "XINYI", "KH", "TAIWAN"];
    const matchedToken = tokens.find((t) => dest.includes(t) && wh.includes(t));
    if (matchedToken) {
      hours = 6;
      rule = `同城配送（${matchedToken}）`;
    } else {
      hours = 24;
      rule = "跨城配送";
    }
  } else {
    rule = "同倉自取";
  }
  const etaDate = new Date(base.getTime() + hours * 3600 * 1000);
  return {
    eta_at: etaDate.toISOString(),
    hours,
    rule,
  };
}

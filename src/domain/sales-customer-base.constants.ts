/**
 * Constants for 銷售客戶基盤（/crm/sales/customer-base）
 *
 * Pure types & const enums — safe to import from client components.
 * Server-only domain helper（含 supabase 直連）在 sales-customer-base.ts。
 *
 * 之所以拆出來：client board (use client) 只需要型別 / 顯示常數，
 * 直接 import `@/domain/sales-customer-base` 會把含 `import "server-only"`
 * 的 module graph 拖進 client bundle、Turbopack 編譯爆 build error。
 */

// ──────────────────────────────────────────────────────────────────────────
// HABC 4 級分類
// ──────────────────────────────────────────────────────────────────────────

/** HABC：H=熱潛客 / A=積極跟進 / B=培養中 / C=長期維護 / null=未分級 */
export type HabcGrade = "H" | "A" | "B" | "C";
export const HABC_GRADES: HabcGrade[] = ["H", "A", "B", "C"];

export const HABC_LABEL: Record<HabcGrade, string> = {
  H: "H 熱潛客",
  A: "A 積極跟進",
  B: "B 培養中",
  C: "C 長期維護",
};

export const HABC_SUB: Record<HabcGrade, string> = {
  H: "需本週內跟進",
  A: "3 個月內購買",
  B: "半年左右",
  C: "每月維持接觸",
};

// ──────────────────────────────────────────────────────────────────────────
// 跟進狀態
// ──────────────────────────────────────────────────────────────────────────

/** 跟進狀態：urgent=逾期 / today=今明 / ok=未來 / none=未排程 */
export type FollowUpStatus = "urgent" | "today" | "ok" | "none";

export const FOLLOW_UP_LABEL: Record<FollowUpStatus, string> = {
  urgent: "🔴 逾期未跟進",
  today: "🟡 今日需跟進",
  ok: "🟢 追蹤中",
  none: "⬜ 長期維護",
};

// ──────────────────────────────────────────────────────────────────────────
// CRM board view types（client 拿來宣告 props 型別）
// ──────────────────────────────────────────────────────────────────────────

export type SalesCustomerCrmRow = {
  // 基本
  id: string;
  code: string;
  name: string;
  type: "individual" | "corporate";
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
  source_module: string | null;
  created_at: string;
  // CRM 視角
  habc_grade: HabcGrade | null;
  follow_up_status: FollowUpStatus | null;
  next_follow_up_date: string | null;
  /** 距下次跟進的天數（負=逾期） */
  days_until_next_follow_up: number | null;
  vehicle_count: number;
  contact_count: number;
};

export type SalesCustomerCrmKpi = {
  total: number;
  h: number;
  a: number;
  b: number;
  c: number;
  unclassified: number;
  this_month_new: number;
  urgent: number;
  today: number;
};

export type SalesCustomerCrmFilters = {
  /** all | H | A | B | C | unclassified | urgent | today | new */
  quick: string;
  /** all | urgent | today | ok | none */
  follow_status: string;
  /** keyword：name / phone / code */
  q: string;
};

// ──────────────────────────────────────────────────────────────────────────
// List board basic filters / row（table view 用）
// ──────────────────────────────────────────────────────────────────────────

export type CustomerBaseFilters = {
  /** all | individual | corporate */
  type: string;
  /** all | active | inactive */
  status: string;
  /** code / name / phone / tax_id / national_id / email */
  q: string;
};

export type CustomerBaseRow = {
  id: string;
  code: string;
  name: string;
  type: "individual" | "corporate";
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  source_module: string | null;
  is_active: boolean;
  created_at: string;
  vehicle_count: number;
  contact_count: number;
};

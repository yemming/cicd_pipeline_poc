/**
 * Client-safe constants for Dashboard Reminders
 *
 * 不可 import server-only / supabase / next/headers / next/server。
 * Modal / 子元件統一從這支拿 types + accent color map + 預設訂閱 codes。
 */

export type ReminderAccent = "navy" | "amber" | "red" | "teal" | "blue";

export type ReminderCategory =
  | "sales"
  | "aftersales"
  | "inventory"
  | "accounting"
  | "crm"
  | "admin";

/** catalog 一筆（reminder_definitions） */
export type ReminderDefinition = {
  code: string;
  label: string;
  description: string | null;
  icon: string;
  accent: ReminderAccent;
  category: ReminderCategory;
  query_kind: string;
  target_href_template: string;
  permission: string | null;
  display_order: number;
};

/** 訂閱單 + 跑完 query 後組成的 dashboard 渲染單位 */
export type ReminderItem = {
  slotIndex: number;          // 0..5
  code: string;
  label: string;
  description: string | null;
  icon: string;
  accent: ReminderAccent;
  category: ReminderCategory;
  count: number;              // 沒撈到就 0
  targetHref: string;         // 已套 brandId / query 後的最終 URL
  error: string | null;       // query fallback 的 warning
};

/** 6 slot dashboard：null = 空 slot */
export type ReminderSlots = (ReminderItem | null)[];

/** 新用戶首次開 dashboard 用的預設 6 個 reminder */
export const DEFAULT_SUBSCRIBED_CODES = [
  "unsigned_orders",
  "pending_delivery",
  "d3_followup",
  "overdue_aftersales",
  "new_car_inventory",
  "quote_pending_leads",
] as const;

export const MAX_REMINDER_SLOTS = 6;

/** accent → tailwind class（給 StatBubble 樣式用） */
export const ACCENT_HEX: Record<ReminderAccent, string> = {
  navy:  "#1A3A5C",
  amber: "#C9A84C",
  red:   "#CC0000",
  teal:  "#0F6E56",
  blue:  "#185FA5",
};

export const CATEGORY_LABEL: Record<ReminderCategory, string> = {
  sales:      "銷售",
  aftersales: "售後",
  inventory:  "庫存",
  accounting: "會計",
  crm:        "CRM",
  admin:      "管理",
};

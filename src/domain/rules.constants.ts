/**
 * Domain — Business Rules constants（client + server 共用）
 *
 * 不能放在 src/domain/rules.ts，因為該檔是 "use server" — 只能 export async function。
 */

// ─────────────────────────────────────────────────────────────────────────────
// Alert Rules (rule_kind='alert_rule') chip palette + options
// ─────────────────────────────────────────────────────────────────────────────

export const ALERT_RULE_PRIORITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "critical", label: "緊急" },
  { value: "high", label: "高" },
  { value: "normal", label: "一般" },
  { value: "low", label: "低" },
];

export const ALERT_RULE_PRIORITY_CHIP: Record<
  string,
  { label: string; chip: string }
> = {
  critical: { label: "緊急", chip: "bg-[#FDECEA] text-[#CC0000]" },
  high: { label: "高", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  normal: { label: "一般", chip: "bg-[#EBF3FF] text-[#1A3A5C]" },
  low: { label: "低", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

export const ALERT_RULE_TONE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "red", label: "紅 critical" },
  { value: "amber", label: "黃 warning" },
  { value: "navy", label: "藍 info" },
  { value: "neutral", label: "灰 neutral" },
];

export const ALERT_RULE_TONE_CHIP: Record<string, { label: string; chip: string }> = {
  red: { label: "紅", chip: "bg-[#FDECEA] text-[#CC0000]" },
  amber: { label: "黃", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  navy: { label: "藍", chip: "bg-[#EBF3FF] text-[#1A3A5C]" },
  neutral: { label: "灰", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

export const ALERT_RULE_CHANNEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "line", label: "LINE" },
  { value: "email", label: "Email" },
  { value: "dashboard", label: "Dashboard" },
  { value: "sms", label: "SMS" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Alert Escalation (rule_kind='alert_escalation') chip palette + options
// ─────────────────────────────────────────────────────────────────────────────

export const ALERT_ESCALATION_RECIPIENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "sa", label: "SA 服務顧問" },
  { value: "manager", label: "店長" },
  { value: "purchaser", label: "採購主管" },
  { value: "owner", label: "老闆" },
  { value: "warehouse", label: "倉管" },
];

export const ALERT_ESCALATION_RECIPIENT_LABEL: Record<string, string> =
  Object.fromEntries(ALERT_ESCALATION_RECIPIENT_OPTIONS.map((o) => [o.value, o.label]));

export const ALERT_ESCALATION_CHANNEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "dashboard", label: "Dashboard" },
  { value: "line", label: "LINE" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

export const ALERT_ESCALATION_LEVEL_CHIP: Record<number, { chip: string; label: string }> = {
  1: { chip: "bg-[#EBF3FF] text-[#1A3A5C]", label: "L1" },
  2: { chip: "bg-[#FDF3E3] text-[#854F0B]", label: "L2" },
  3: { chip: "bg-[#FDECEA] text-[#CC0000]", label: "L3" },
};

export const ITEM_PERMISSION_CAPABILITIES: Array<{
  key: string;
  label: string;
  section: "商品基礎資料" | "定價管理" | "序列號/批號";
}> = [
  { key: "view_items", label: "查看商品清單", section: "商品基礎資料" },
  { key: "create_item", label: "新增商品", section: "商品基礎資料" },
  { key: "update_item", label: "修改商品資訊", section: "商品基礎資料" },
  { key: "archive_item", label: "停用/刪除商品", section: "商品基礎資料" },
  { key: "view_price", label: "查看售價", section: "定價管理" },
  { key: "update_store_price", label: "修改門市定價", section: "定價管理" },
  { key: "set_special_discount", label: "設定特殊折扣", section: "定價管理" },
  { key: "config_serial_tracking", label: "序列號追蹤設定", section: "序列號/批號" },
  { key: "config_batch_tracking", label: "批號管理設定", section: "序列號/批號" },
];

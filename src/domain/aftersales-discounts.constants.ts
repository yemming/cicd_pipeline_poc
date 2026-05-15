/**
 * Domain — Aftersales Discount Authority constants（client + server 共用）
 *
 * 不能放在 src/domain/aftersales-discounts.ts，因為該檔是 "use server"。
 */

export const DEADLINE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "same_day", label: "當日內完成" },
  { value: "2h", label: "2 小時內" },
  { value: "4h", label: "4 小時內" },
  { value: "next_day", label: "次日內完成" },
];

export const OVERDUE_ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "return_to_applicant", label: "自動退回申請人" },
  { value: "notify_next_level", label: "通知下一級審批人" },
  { value: "auto_approve", label: "視同同意（自動通過）" },
];

export const DEADLINE_LABEL: Record<string, string> = Object.fromEntries(
  DEADLINE_OPTIONS.map((o) => [o.value, o.label]),
);

export const OVERDUE_ACTION_LABEL: Record<string, string> = Object.fromEntries(
  OVERDUE_ACTION_OPTIONS.map((o) => [o.value, o.label]),
);

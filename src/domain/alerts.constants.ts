/**
 * Alerts 共用常數 / 純值（給 client component 也可 import）
 *
 * 拆檔原因：domain/alerts.ts 是 "use server"，禁止 export 非 async 值。
 */

export const ABC_CHIP: Record<string, string> = {
  A: "bg-[#FDECEA] text-[#CC0000]",
  B: "bg-[#FDF3E3] text-[#854F0B]",
  C: "bg-[#E8F5F0] text-[#0F6E56]",
};

export const ABC_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "（未分類）" },
  { value: "A", label: "A 類" },
  { value: "B", label: "B 類" },
  { value: "C", label: "C 類" },
];

export const ALERT_PRIORITY_CHIP: Record<
  string,
  { label: string; chip: string }
> = {
  critical: { label: "緊急", chip: "bg-[#FDECEA] text-[#CC0000]" },
  high: { label: "高", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  medium: { label: "中", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  normal: { label: "一般", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  low: { label: "低", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

export const ALERT_PRIORITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "critical", label: "緊急" },
];

// 工單增項閉環（parts_workorder_loop_entries）
export const WORKORDER_LOOP_STATUS_CHIP: Record<string, { label: string; chip: string }> = {
  pending: { label: "待料中", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  escalated: { label: "逾期催單", chip: "bg-[#FDECEA] text-[#CC0000]" },
  resolved: { label: "已解除", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
};

export const WORKORDER_LOOP_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "pending", label: "待料中" },
  { value: "escalated", label: "逾期催單" },
  { value: "resolved", label: "已解除" },
];

/**
 * ro-handoffs.constants.ts
 *
 * 「串接工單」狀態 token + chip class。
 *
 * 本模組以 `pre_inspections` 為主表，沒有獨立 handoff 表。
 * 「狀態」是衍生自 PI 的 `signed_at` / `repair_order_id`：
 *   - awaiting_signature ：尚未簽名（不可轉）
 *   - ready              ：已簽名 + 未串接 RO（可轉）
 *   - transferred        ：已串接 RO
 */

export const HANDOFF_STATUS = ["awaiting_signature", "ready", "transferred"] as const;
export type HandoffStatus = (typeof HANDOFF_STATUS)[number];

export const HANDOFF_LABEL: Record<HandoffStatus, string> = {
  awaiting_signature: "待簽名",
  ready: "可串接",
  transferred: "已串接",
};

export const HANDOFF_CHIP: Record<HandoffStatus, string> = {
  awaiting_signature: "bg-[#F2F2F2] text-[#6B6A68]",
  ready: "bg-[#FDF3E3] text-[#854F0B]",
  transferred: "bg-[#EAF3DE] text-[#3B6D11]",
};

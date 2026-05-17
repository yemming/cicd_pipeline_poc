/**
 * 常數抽到獨立檔（'use server' module 不能 export 非 async value）
 * 提案：docs/proposals/feature-rs-m3-kpi-targets-phase1.md
 */

export const SALES_KPI_TARGET_KEYS = [
  // Layer 1 結果指標
  "monthly_delivery_target",
  "monthly_order_target",
  "monthly_close_rate_target",
  // Layer 2 過程指標
  "build_complete_rate_target",
  "trial_drive_rate_target",
  "quote_conversion_rate_target",
  "order_conversion_rate_target",
  "gold_moment_quote_rate_target",
  "delivery_revisit_3day_rate_target",
] as const;

export type SalesKpiTargetKey = (typeof SALES_KPI_TARGET_KEYS)[number];

export const HABC_THRESHOLD_KEYS = ["H", "A", "B", "C"] as const;
export type HabcThresholdKey = (typeof HABC_THRESHOLD_KEYS)[number];

export const HABC_ACCENT: Record<HabcThresholdKey, { bg: string; border: string; text: string; letterBg: string }> = {
  H: { bg: "bg-[#FDECEA]", border: "border-[#F5AEAD]", text: "text-[#CC0000]", letterBg: "bg-[#CC0000]" },
  A: { bg: "bg-[#FDF3E3]", border: "border-[#E8C580]", text: "text-[#854F0B]", letterBg: "bg-[#D78A1A]" },
  B: { bg: "bg-[#EAF4FB]", border: "border-[#85B7EB]", text: "text-[#185FA5]", letterBg: "bg-[#185FA5]" },
  C: { bg: "bg-[#F2F2F2]", border: "border-[#D5D3CB]", text: "text-[#5A5955]", letterBg: "bg-[#6B6A68]" },
};

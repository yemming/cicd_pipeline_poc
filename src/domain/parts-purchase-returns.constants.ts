/**
 * Parts Purchase Returns — client-importable constants
 *
 * 對應 spec：04_採購管理_採購退貨.html / M04U-13 升 A 級。
 *
 * `parts-purchase-returns.ts` 是 'use server' module、不能 export 非 async value，
 * 純常數 / type / formatter 都拆到此檔讓 client component 也能 import。
 *
 * RETURN_REASONS / RETURN_STATUSES / fmtDateTime 直接 re-export procurement.constants
 * 的同名 export，避免兩份維護漂移。
 */

export { RETURN_REASONS, RETURN_STATUSES, fmtDateTime } from "./procurement.constants";

import type { ToneKey } from "@/components/visualization/tone";

export type ReturnReasonBreakdown = {
  reason: string;
  count: number;
  amount: number;
};

/**
 * 退貨原因 → KpiCard / DonutChart 用 tone（限定 KpiCard 接受的 7 種 enum）。
 *
 * 注意：`KpiCard` 只接受 `blue / teal / amber / red / purple / green / gray`。
 */
export const REASON_TONE: Record<string, ToneKey> = {
  spec_mismatch: "blue",
  quality_issue: "red",
  overship: "amber",
  wrong_item: "purple",
  damaged: "red",
  other: "gray",
};

/**
 * DonutChart segment 配色（HEX，跟 chart-tokens SERIES_COLORS 對齊）。
 */
export const REASON_DONUT_COLOR: Record<string, string> = {
  spec_mismatch: "#1A3A5C", // navy
  quality_issue: "#CC0000", // red
  overship: "#C2710C", // amber-700
  wrong_item: "#6F50C9", // purple
  damaged: "#B23F3F", // red-darker
  other: "#9A9890", // gray-400
};

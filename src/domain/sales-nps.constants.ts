/**
 * Sales / Aftersales NPS Dashboard — 純展示常數（client / server 兩用）
 *
 * NPS（Net Promoter Score）= %推薦者(9-10) - %批評者(0-6)
 *   - promoter（推薦者）：score 9–10
 *   - passive（中立者）：score 7–8
 *   - detractor（批評者）：score 0–6
 *
 * v2（2026-05-17 CRM05A/B 升級）：
 *   - 期間改為 6m / 12m（移除 7d / 30d / 90d / all），預設 6 個月
 *   - 加 aspect 面向 label 與排序（sales / aftersales 各一套）
 */

export type NpsCategory = "promoter" | "passive" | "detractor";

export const NPS_CATEGORY_LABEL: Record<NpsCategory, string> = {
  promoter: "推薦者",
  passive: "中立者",
  detractor: "批評者",
};

/** 對應 design-pattern token；批評者紅、中立者黃、推薦者綠 */
export const NPS_CATEGORY_BADGE: Record<NpsCategory, { bg: string; fg: string }> = {
  promoter: { bg: "#EAF3DE", fg: "#3B6D11" },
  passive: { bg: "#FDF3E3", fg: "#854F0B" },
  detractor: { bg: "#FDECEA", fg: "#CC0000" },
};

/** 分段顏色（用於 stacked bar、KPI 數字） */
export const NPS_SEGMENT_COLOR: Record<NpsCategory, string> = {
  promoter: "#3B6D11",
  passive: "#854F0B",
  detractor: "#CC0000",
};

export type RangeKey = "6m" | "12m";

export const RANGE_MONTHS: Record<RangeKey, number> = {
  "6m": 6,
  "12m": 12,
};

export const RANGE_LABEL: Record<RangeKey, string> = {
  "6m": "近 6 個月",
  "12m": "近 12 個月",
};

export function classifyScore(score: number): NpsCategory {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

/** SA / RS 卡片所需的 aspect 順序（依設計稿 CRM05A/B） */
export type SalesAspectKey =
  | "sa_attitude"
  | "test_ride"
  | "delivery_flow"
  | "price_transparency"
  | "waiting_time"
  | "overall";

export const SALES_ASPECT_ORDER: SalesAspectKey[] = [
  "sa_attitude",
  "test_ride",
  "delivery_flow",
  "price_transparency",
  "waiting_time",
  "overall",
];

export const SALES_ASPECT_LABEL: Record<SalesAspectKey, string> = {
  sa_attitude: "銷售顧問服務態度",
  test_ride: "試駕體驗安排",
  delivery_flow: "交車流程順暢度",
  price_transparency: "報價透明度",
  waiting_time: "等候時間感受",
  overall: "整體購車體驗",
};

export type AftersalesAspectKey =
  | "sa_attitude"
  | "repair_quality"
  | "waiting_time"
  | "cost_transparency"
  | "pickup_explanation"
  | "overall";

export const AFTERSALES_ASPECT_ORDER: AftersalesAspectKey[] = [
  "sa_attitude",
  "repair_quality",
  "waiting_time",
  "cost_transparency",
  "pickup_explanation",
  "overall",
];

export const AFTERSALES_ASPECT_LABEL: Record<AftersalesAspectKey, string> = {
  sa_attitude: "SA 服務態度與溝通",
  repair_quality: "維修品質與效果",
  waiting_time: "等待時間與準時交車",
  cost_transparency: "費用透明度與說明",
  pickup_explanation: "取車說明完整度",
  overall: "整體進廠體驗",
};

/**
 * Sales NPS Dashboard — 純展示常數（client / server 兩用）
 *
 * NPS（Net Promoter Score）= %推薦者(9-10) - %批評者(0-6)
 *   - promoter（推薦者）：score 9–10
 *   - passive（中立者）：score 7–8
 *   - detractor（批評者）：score 0–6
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

export const RANGE_DAYS: Record<"7d" | "30d" | "90d" | "all", number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

export const RANGE_LABEL: Record<"7d" | "30d" | "90d" | "all", string> = {
  "7d": "近 7 天",
  "30d": "近 30 天",
  "90d": "近 90 天",
  all: "全部",
};

export type RangeKey = "7d" | "30d" | "90d" | "all";

export function classifyScore(score: number): NpsCategory {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

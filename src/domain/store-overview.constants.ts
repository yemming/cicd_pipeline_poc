/**
 * Store Overview Dashboard — 純展示常數（client / server 共用）
 *
 * 「門店綜合概覽」是店長視角的跨部門儀表板：把銷售（RS）+ 售後（SA）+ 跨部門客戶標籤
 * 三個區塊的核心 KPI 用唯讀方式拉到同一張頁面。
 */

export type StoreOverviewRangeKey = "30d" | "90d" | "ytd";

export const STORE_RANGE_LABEL: Record<StoreOverviewRangeKey, string> = {
  "30d": "近 30 天",
  "90d": "近 90 天",
  ytd: "本年至今",
};

export const STORE_RANGE_DAYS: Record<StoreOverviewRangeKey, number | null> = {
  "30d": 30,
  "90d": 90,
  ytd: null, // 自年初算
};

/** 行業標竿 NPS（重機業界平均，純參考用） */
export const INDUSTRY_BENCHMARK_NPS = 50;

/** NPS 分數的色彩級距：>=50 綠 / 0–49 黃 / <0 紅 */
export function npsColor(score: number): { bg: string; fg: string } {
  if (score >= 50) return { bg: "#EAF3DE", fg: "#3B6D11" };
  if (score >= 0) return { bg: "#FDF3E3", fg: "#854F0B" };
  return { bg: "#FDECEA", fg: "#CC0000" };
}

/** Delta 上下箭頭色彩 */
export function deltaColor(delta: number): { sign: string; fg: string } {
  if (delta > 0) return { sign: "▲", fg: "#3B6D11" };
  if (delta < 0) return { sign: "▼", fg: "#CC0000" };
  return { sign: "—", fg: "#9A9890" };
}

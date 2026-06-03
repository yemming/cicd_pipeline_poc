/**
 * GRP05 集團季度績效報告 — client-safe 常數 + 型別。
 *
 * 與 group-quarterly-report.ts（server-only，撈資料）拆開：本檔不含任何 server
 * 相依，純常數/型別，供 "use client" 元件（board / printable）安全 import
 * GRADE_DEF 這個 runtime 值。server helper 把型別從這裡 re-export 出去。
 */

/* 評級 */

export type GradeTag = "excellent" | "good" | "watch" | "intervene";

/** Health Score 對映季度評級（門檻對齊 GRP05 設計稿：>=85 優秀 / >=75 良好 / >=60 關注 / <60 介入） */
export const GRADE_DEF: Record<
  GradeTag,
  { label: string; emoji: string; color: string; bg: string }
> = {
  excellent: { label: "優秀", emoji: "🏆", color: "#0F6E56", bg: "#E8F5F0" },
  good: { label: "良好", emoji: "✅", color: "#185FA5", bg: "#EAF4FB" },
  watch: { label: "關注", emoji: "⚠", color: "#854F0B", bg: "#FDF3E3" },
  intervene: { label: "介入", emoji: "🔴", color: "#CC0000", bg: "#FDECEA" },
};

export function gradeOf(health: number | null): GradeTag | null {
  if (health == null) return null;
  if (health >= 85) return "excellent";
  if (health >= 75) return "good";
  if (health >= 60) return "watch";
  return "intervene";
}

/* 型別 */

export type QuarterlyStoreRow = {
  orgId: string;
  name: string;
  /** 新車銷量季合計 */
  newCar: number | null;
  /** 新車季目標（月目標 ×3） */
  newCarTarget: number | null;
  /** 新車達成率 0..1+ */
  newCarRate: number | null;
  /** 售後台次季合計 */
  service: number | null;
  serviceTarget: number | null;
  serviceRate: number | null;
  /** NPS 季平均 */
  nps: number | null;
  /** 零件周轉（近月，seed 僅單月） */
  turnover: number | null;
  /** Health Score（季末錨點） */
  health: number | null;
  /** Health 環比（vs 上季錨點） */
  healthDelta: number | null;
  grade: GradeTag | null;
};

export type QuarterMonthly = {
  /** YYYY-MM-01 */
  month: string;
  /** 顯示用「1月」 */
  label: string;
  newCar: number | null;
  service: number | null;
  nps: number | null;
};

export type QuarterlyHighlight = { tone: "good" | "warn"; text: string };

export type GroupQuarterlyReportForPrint = {
  brandId: string;
  /** 報告 id / URL 用，例：2026-Q1 */
  quarterKey: string;
  /** 「2026 年 Q1」 */
  quarterLabel: string;
  /** 「2026 年 1～3 月」 */
  periodRangeLabel: string;
  /** 資料截止「2026-03-31」 */
  dataCutoff: string;
  storeCount: number;
  /** 達標門店數（新車達成率 >= 90%） */
  achievedStoreCount: number;

  groupNewCar: number | null;
  groupNewCarTarget: number | null;
  groupNewCarRate: number | null;
  /** 銷量環比（比較基準見 compareLabel；ratio，可負） */
  groupNewCarDelta: number | null;

  groupService: number | null;
  groupServiceTarget: number | null;
  groupServiceRate: number | null;
  groupServiceDelta: number | null;

  groupNps: number | null;
  groupHealth: number | null;
  /** Health 環比（一律 vs 上季季末錨點） */
  groupHealthDelta: number | null;

  /** 銷量/售後環比的比較基準說明，例：「vs 去年同季（2025 Q1）」 */
  compareLabel: string;

  stores: QuarterlyStoreRow[];
  monthly: QuarterMonthly[];
  highlights: QuarterlyHighlight[];
};

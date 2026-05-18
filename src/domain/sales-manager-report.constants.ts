/**
 * RS_M2 業績報表（銷售管理 / 主管視角）— 靜態 mock data。
 *
 * 對應 nav_node `6c385e0a-a0b2-46de-a25c-b9dc396c3170`（Indian / 銷售管理 / 業績報表）。
 * Phase 1 全部 mock；Phase 2 接 sales_metrics_monthly view + kpi_targets 表。
 */

export type Period = "month" | "quarter" | "year";

export const PERIOD_LABEL: Record<Period, string> = {
  month: "2026 年 5 月（本月）",
  quarter: "2026 年 Q2（本季）",
  year: "2026 年（本年）",
};

// ── Layer 1：結果指標（總經理視角） ──
export interface KpiCard {
  label: string;
  value: number;
  unit: string;
  target?: number;
  deltaText?: string;
  deltaKind?: "up" | "down" | "flat";
  tone: "good" | "warn" | "alert" | "plain";
  color: "teal" | "amber" | "red" | "blue" | "purple" | "default";
  progressPct?: number;
  progressBar?: "teal" | "amber" | "red" | "blue";
}

export const LAYER1_KPIS: KpiCard[] = [
  {
    label: "月度成交台數", value: 11, unit: "台",
    target: 15, deltaText: "+2 vs 上月", deltaKind: "up",
    tone: "good", color: "teal", progressPct: 73, progressBar: "teal",
  },
  {
    label: "月度訂車台數", value: 13, unit: "台",
    target: 16, deltaText: "+1 vs 上月", deltaKind: "up",
    tone: "warn", color: "amber", progressPct: 81, progressBar: "amber",
  },
  {
    label: "整體成交率", value: 9.2, unit: "%",
    target: 12, deltaText: "-0.8% vs 上月", deltaKind: "down",
    tone: "alert", color: "red", progressPct: 77, progressBar: "red",
  },
  {
    label: "本月總業績", value: 1408, unit: "萬",
    target: 1920, deltaText: "+12% vs 上月", deltaKind: "up",
    tone: "good", color: "blue", progressPct: 73, progressBar: "blue",
  },
];

// ── Layer 2：過程指標（銷售主管視角） ──
export const LAYER2_KPIS: KpiCard[] = [
  {
    label: "建檔完整率", value: 88, unit: "%",
    target: 90, deltaText: "≈ 目標", deltaKind: "flat",
    tone: "good", color: "teal", progressPct: 88, progressBar: "teal",
  },
  {
    label: "試乘試駕率", value: 42, unit: "%",
    target: 60, deltaText: "-5% vs 上月", deltaKind: "down",
    tone: "alert", color: "red", progressPct: 70, progressBar: "red",
  },
  {
    label: "報價轉化率", value: 63, unit: "%",
    target: 70, deltaText: "+3% vs 上月", deltaKind: "up",
    tone: "warn", color: "amber", progressPct: 90, progressBar: "amber",
  },
  {
    label: "訂車成交率", value: 58, unit: "%",
    target: 60, deltaText: "≈ 目標", deltaKind: "flat",
    tone: "good", color: "teal", progressPct: 97, progressBar: "teal",
  },
  {
    label: "試駕後即時報價率", value: 54, unit: "%",
    target: 80, deltaText: "-8% vs 上月", deltaKind: "down",
    tone: "alert", color: "red", progressPct: 68, progressBar: "red",
  },
];

// ── Layer 3：行為數據（銷售顧問視角） ──
export const LAYER3_KPIS: KpiCard[] = [
  {
    label: "到店接觸人次", value: 119, unit: "人",
    deltaText: "+14 vs 上月", deltaKind: "up",
    tone: "plain", color: "blue",
  },
  {
    label: "電子手卡建檔數", value: 105, unit: "份",
    deltaText: "建檔率 88%", deltaKind: "flat",
    tone: "plain", color: "blue",
  },
  {
    label: "試乘試駕人次", value: 44, unit: "次",
    deltaText: "試駕率 42%", deltaKind: "flat",
    tone: "plain", color: "blue",
  },
  {
    label: "報價單開立數", value: 28, unit: "張",
    deltaText: "報價率 63%", deltaKind: "flat",
    tone: "plain", color: "blue",
  },
  {
    label: "交車後 3 日回訪率", value: 91, unit: "%",
    target: 90, deltaText: "✅ 達標", deltaKind: "up",
    tone: "good", color: "teal",
  },
];

// ── 損益平衡 ──
export interface BepData {
  achieved: number;
  bepPoint: number;
  monthlyTarget: number;
}

export const BEP_DATA: BepData = {
  achieved: 11,
  bepPoint: 9,
  monthlyTarget: 15,
};

// ── 月份趨勢 ──
export interface MonthlyDatum {
  label: string;
  count: number;
  ratePct: number;
  rateKind: "up" | "down" | "flat";
  isCurrent?: boolean;
}

export const MONTHLY_TREND: MonthlyDatum[] = [
  { label: "1 月", count: 8, ratePct: -20, rateKind: "down" },
  { label: "2 月", count: 7, ratePct: -13, rateKind: "down" },
  { label: "3 月", count: 12, ratePct: 71, rateKind: "up" },
  { label: "4 月", count: 9, ratePct: -25, rateKind: "down" },
  { label: "5 月（本月）", count: 11, ratePct: 22, rateKind: "up", isCurrent: true },
];

export const MONTHLY_CHART_TARGET = 15;

// ── RS 個人業績排行 ──
export interface RsRow {
  name: string;
  sales: number;
  rev: number;        // 業績金額（萬）
  trial: number;      // 試駕率 %
  quote: number;      // 報價率 %
  golden: number;     // 試駕後即時報價率 %（黃金時段）
  revisit: number;    // 回訪率 %
  habc: number;       // HABC H+A 人數
}

export const RS_RANKING: RsRow[] = [
  { name: "林佳蓉", sales: 4, rev: 512, trial: 55, quote: 70, golden: 65, revisit: 93, habc: 8 },
  { name: "張志明", sales: 3, rev: 384, trial: 40, quote: 58, golden: 50, revisit: 90, habc: 5 },
  { name: "陳雅惠", sales: 3, rev: 384, trial: 38, quote: 62, golden: 48, revisit: 91, habc: 6 },
  { name: "王俊傑", sales: 1, rev: 128, trial: 35, quote: 60, golden: 52, revisit: 88, habc: 3 },
];

// ── 車系業績 ──
export interface ModelRow {
  name: string;
  series: string;
  count: number;
  rev: number;        // 業績（萬）
  max: number;        // 量級基準（畫 bar 比例用）
}

export const MODEL_SALES: ModelRow[] = [
  { name: "Panigale V4",      series: "超跑系列",       count: 4, rev: 512, max: 4 },
  { name: "Monster SP",       series: "Monster 系列",  count: 3, rev: 288, max: 4 },
  { name: "Streetfighter V2", series: "街車系列",       count: 2, rev: 210, max: 4 },
  { name: "Multistrada V4",   series: "越野旅行",       count: 1, rev: 168, max: 4 },
  { name: "Diavel V4",        series: "動力巡航",       count: 1, rev: 158, max: 4 },
  { name: "Scrambler",        series: "Scrambler 系列", count: 0, rev: 0,   max: 4 },
];

// ── 週趨勢 ──
export interface WeeklyDatum {
  label: string;
  contacts: number;
  sales: number;
}

export const WEEKLY_TREND: WeeklyDatum[] = [
  { label: "第1週", contacts: 28, sales: 3 },
  { label: "第2週", contacts: 32, sales: 4 },
  { label: "第3週", contacts: 35, sales: 2 },
  { label: "第4週（進行中）", contacts: 24, sales: 2 },
];

// ── RS 篩選清單 ──
export const RS_FILTER_OPTIONS = ["all", "林佳蓉", "陳雅惠", "張志明", "王俊傑"] as const;
export type RsFilterValue = (typeof RS_FILTER_OPTIONS)[number];

export const LAST_UPDATED = "2026-05-14";

// ── Round-9 Batch B: _FALLBACK 別名 ──
// 上方常數 Phase 1 是 mock，Phase 2 起改為 DB query 失敗時的 fallback。
// 保留原名同時 export _FALLBACK 別名供 domain helper 使用。
export const LAYER1_KPIS_FALLBACK = LAYER1_KPIS;
export const LAYER2_KPIS_FALLBACK = LAYER2_KPIS;
export const LAYER3_KPIS_FALLBACK = LAYER3_KPIS;
export const BEP_DATA_FALLBACK = BEP_DATA;
export const MONTHLY_TREND_FALLBACK = MONTHLY_TREND;
export const MONTHLY_CHART_TARGET_FALLBACK = MONTHLY_CHART_TARGET;
export const RS_RANKING_FALLBACK = RS_RANKING;
export const MODEL_SALES_FALLBACK = MODEL_SALES;
export const WEEKLY_TREND_FALLBACK = WEEKLY_TREND;
export const LAST_UPDATED_FALLBACK = LAST_UPDATED;

/**
 * Client-safe constants & types for parts-analytics-stale domain.
 *
 * 不 import server-only 模組，UI client component 可以直接 import。
 *
 * 對應頁面：/parts/analytics/stale（呆滯庫存）
 * Spec：docs/DUCATI_v2_output/04_庫存管理/09_分析報表/12_分析報表_呆滯庫存.html
 */

import type { ToneKey } from "@/components/visualization";

// ---------------------------------------------------------------------------
// Re-export 既有 server-side types（讓 client board 只 import 這一個 entry）
// ---------------------------------------------------------------------------

export type AbcClass = "A" | "B" | "C";

export type StaleReasonCode =
  | "discontinued"
  | "overstock"
  | "rev_change"
  | "other";

export type StaleBucketKey = "b90_180" | "b180_365" | "b365_plus";

export type StaleSuggestedAction = "scrap" | "promote" | "transfer" | "watch";

export type StaleRow = {
  item_id: string;
  item_code: string;
  item_name: string;
  category: string | null;
  control_type: string | null;
  abc_class: AbcClass | null;
  qty: number;
  value: number;
  last_issue_date: string | null;
  days_idle: number;
  reason_code: StaleReasonCode;
  reason_label: string;
  suggested_action: StaleSuggestedAction;
  bucket: StaleBucketKey;
  /** 主要倉庫名（若 item 分散多倉，取庫存量最大的那個） */
  warehouse_name: string | null;
};

export type StaleOverview = {
  total_stale_value: number;
  total_inventory_value: number;
  total_stale_count: number;
  total_sku_count: number;
  severe_count: number;
  new_this_month: number;
  buckets: Record<StaleBucketKey, number>;
  reasons: Array<{
    code: StaleReasonCode;
    label: string;
    count: number;
  }>;
};

// ---------------------------------------------------------------------------
// A-grade 新增 types：KPI / BarChart / HeatMap
// ---------------------------------------------------------------------------

/** 6 段庫齡 bucket — BarChart 用。前 3 段「健康」、後 3 段「呆滯」對齊既有定義 */
export type AgeBucketKey =
  | "d0_30"
  | "d30_60"
  | "d60_90"
  | "d90_180"
  | "d180_365"
  | "d365_plus";

export const AGE_BUCKET_META: Record<
  AgeBucketKey,
  { label: string; shortLabel: string; isStale: boolean; color: string }
> = {
  d0_30: { label: "0–30 天", shortLabel: "0-30", isStale: false, color: "#3B6D11" },
  d30_60: { label: "30–60 天", shortLabel: "30-60", isStale: false, color: "#7B9F2B" },
  d60_90: { label: "60–90 天", shortLabel: "60-90", isStale: false, color: "#C8A027" },
  d90_180: { label: "90–180 天", shortLabel: "90-180", isStale: true, color: "#854F0B" },
  d180_365: { label: "180–365 天", shortLabel: "180-365", isStale: true, color: "#D85A30" },
  d365_plus: { label: "365 天+", shortLabel: "365+", isStale: true, color: "#CC0000" },
};

export const STALE_AGE_BUCKETS: AgeBucketKey[] = [
  "d0_30",
  "d30_60",
  "d60_90",
  "d90_180",
  "d180_365",
  "d365_plus",
];

export type AgeBucketBar = {
  bucket: AgeBucketKey;
  label: string;
  count: number;
  value: number;
};

export type WarehouseAgeHeatCell = {
  warehouse_id: string;
  warehouse_name: string;
  bucket: AgeBucketKey;
  count: number;
};

/** KpiCard 用：4 顆 tile 的純數值 */
export type StaleKpiStats = {
  stale_sku_count: number;
  total_stale_value: number;
  oldest_days: number;
  avg_idle_days: number;
  /** delta % vs 30 天前（沒資料就 null） */
  stale_sku_delta_pct: number | null;
};

// ---------------------------------------------------------------------------
// Visual tokens（client board 直接吃）
// ---------------------------------------------------------------------------

export const ABC_BADGE_CLASS: Record<AbcClass, string> = {
  A: "bg-[#FDECEA] text-[#CC0000]",
  B: "bg-[#FDF3E3] text-[#854F0B]",
  C: "bg-[#EAF4FB] text-[#185FA5]",
};

export const REASON_META: Record<
  StaleReasonCode,
  { emoji: string; cls: string; label: string }
> = {
  discontinued: { emoji: "🚗", cls: "bg-[#FDECEA] text-[#CC0000]", label: "停產車型" },
  overstock: { emoji: "📦", cls: "bg-[#FDF3E3] text-[#854F0B]", label: "採購過量" },
  rev_change: { emoji: "🔄", cls: "bg-[#FDF3E3] text-[#854F0B]", label: "規格改版" },
  other: { emoji: "❓", cls: "bg-[#F2F2F2] text-[#6B6A68]", label: "其他" },
};

export const ACTION_META: Record<
  StaleSuggestedAction,
  { label: string; cls: string }
> = {
  scrap: { label: "申請報廢", cls: "bg-[#FDECEA] text-[#CC0000]" },
  promote: { label: "移促銷倉", cls: "bg-[#FDF3E3] text-[#854F0B]" },
  transfer: { label: "跨店調撥", cls: "bg-[#EAF4FB] text-[#185FA5]" },
  watch: { label: "觀察", cls: "bg-[#F2F2F2] text-[#6B6A68]" },
};

export const KPI_TONE: Record<
  "stale_count" | "stale_value" | "oldest" | "avg_idle",
  ToneKey
> = {
  stale_count: "amber",
  stale_value: "red",
  oldest: "red",
  avg_idle: "amber",
};

// ---------------------------------------------------------------------------
// Filter shape
// ---------------------------------------------------------------------------

export type StaleFilter = {
  bucket?: StaleBucketKey | "all";
  abc?: AbcClass | "all";
  reason?: StaleReasonCode | "all";
  warehouse_id?: string | "all";
  q?: string;
};

// ---------------------------------------------------------------------------
// Helpers（純函式 — client/server 共用）
// ---------------------------------------------------------------------------

export function ageBucketOf(days: number): AgeBucketKey {
  if (days >= 365) return "d365_plus";
  if (days >= 180) return "d180_365";
  if (days >= 90) return "d90_180";
  if (days >= 60) return "d60_90";
  if (days >= 30) return "d30_60";
  return "d0_30";
}

export function fmtNTCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `NT$ ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `NT$ ${(n / 10_000).toFixed(1)} 萬`;
  return `NT$ ${Math.round(n).toLocaleString("en-US")}`;
}

export function pct(n: number, base: number): string {
  if (base <= 0) return "—";
  return `${((n / base) * 100).toFixed(1)}%`;
}

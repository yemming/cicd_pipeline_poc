/**
 * Client-safe types & constants for ABC 分類設定（/parts/analytics/abc-settings）。
 *
 * 重要：本檔不可 `import "server-only"`，client board 會 import。
 * 真正的 DB 存取走 `@/domain/parts-abc`（server-only）。
 */

export type AbcClass = "A" | "B" | "C";

export type AbcMetric = "revenue" | "qty" | "profit";

export const ABC_METRIC_OPTIONS: ReadonlyArray<{ value: AbcMetric; label: string; disabled?: boolean }> = [
  { value: "revenue", label: "金額（近 12 個月產值）" },
  { value: "qty", label: "出貨數量（近 12 個月）" },
  { value: "profit", label: "毛利（資料尚未匯入）", disabled: true },
];

/**
 * 頁面用的完整 config（type-stable 對應 abc_classification_config schema 主要欄位）。
 */
export type AbcConfig = {
  id: string | null;
  brand_id: string;
  recalc_trigger: string | null;
  rolling_period_months: number | null;
  threshold_a_pct: number | null;
  threshold_b_pct: number | null;
  count_freq_a_days: number | null;
  count_freq_b_days: number | null;
  count_freq_c_days: number | null;
  safety_stock_days_a: number | null;
  safety_stock_days_b: number | null;
  safety_stock_days_c: number | null;
  new_item_default_class: string | null;
  new_item_grace_months: number | null;
  last_recalc_at: string | null;
  is_active: boolean | null;
};

export type AbcSimulationChange = {
  item_id: string;
  item_code: string;
  item_name: string;
  output_amount_12m: number;
  output_qty_12m: number;
  from: AbcClass;
  to: AbcClass;
};

export type AbcSimulationBuckets = {
  A: { count: number; amount: number };
  B: { count: number; amount: number };
  C: { count: number; amount: number };
  total: { count: number; amount: number };
};

export type AbcSimulationResult = {
  before: AbcSimulationBuckets;
  after: AbcSimulationBuckets;
  changes: AbcSimulationChange[];
  metric: AbcMetric;
  a_percentile: number;
  b_percentile: number;
};

export type AbcSimulationInput = {
  a_percentile: number;
  b_percentile: number;
  metric: AbcMetric;
};

export const DEFAULT_ABC_THRESHOLDS = {
  a_percentile: 80,
  b_percentile: 95,
  metric: "revenue" as AbcMetric,
};

export function classifyByCumPct(
  cum_pct: number,
  a_percentile: number,
  b_percentile: number,
): AbcClass {
  if (cum_pct <= a_percentile) return "A";
  if (cum_pct <= b_percentile) return "B";
  return "C";
}

"use server";

/**
 * Domain Helper — Analytics（分析報表）
 *
 * 範圍：
 *   - ABC 分類（總覽 KPI + 結果明細 + 重跑）
 *   - 庫存周轉率（per-item turnover + 月度趨勢 + class KPI）
 * 呆滯 / 缺貨等其他報表暫時不在這支裡，未來各別補。
 *
 * 對應頁面：
 *   - `/parts/analytics/abc`、規格 `12_分析報表_ABC分類.html`
 *   - `/parts/analytics/turnover`、規格 `12_分析報表_庫存周轉率.html`
 */

import { createClient } from "@/lib/supabase/server";
import { recalcAbcAction } from "@/lib/parts/actions";
import { getActiveScope } from "@/lib/scope/active-scope";

export type AbcClass = "A" | "B" | "C";

export type AbcResultRow = {
  id: string;
  item_id: string;
  abc_class: AbcClass;
  output_amount_12m: number;
  output_qty_12m: number;
  rank_in_brand: number | null;
  cum_pct: number | null;
  prev_class: string | null;
  recalc_at: string;
  /** join 出來的 item info（query layer 補上） */
  item_code: string;
  item_name: string;
};

export type AbcConfigLite = {
  threshold_a_pct: number;
  threshold_b_pct: number;
  rolling_period_months: number;
  count_freq_a_days: number;
  count_freq_b_days: number;
  count_freq_c_days: number;
  last_recalc_at: string | null;
};

export type AbcOverview = {
  config: AbcConfigLite | null;
  counts: { A: number; B: number; C: number; total: number };
  amounts: { A: number; B: number; C: number; total: number };
  pct: { A: number; B: number; C: number };
  /** 4 種 KPI tile 用 */
  kpi: {
    a: { count: number; amount: number; pctOfTypes: number; pctOfAmount: number };
    b: { count: number; amount: number; pctOfTypes: number; pctOfAmount: number };
    c: { count: number; amount: number; pctOfTypes: number; pctOfAmount: number };
    total: { count: number; amount: number };
  };
  /** 已有 prev_class 與當前不同的件數（提示「分類變動」） */
  changedCount: number;
};

function toClass(v: string): AbcClass {
  return v === "A" || v === "B" ? v : "C";
}

/**
 * 撈當前 brand 的 ABC 結果（warehouse_id IS NULL — 跨倉聚合層）。
 */
export async function listAbcResults(filter: {
  classFilter?: AbcClass | "all";
  q?: string;
} = {}): Promise<AbcResultRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("abc_classification_results")
    .select(
      "id, item_id, abc_class, output_amount_12m, output_qty_12m, rank_in_brand, cum_pct, prev_class, recalc_at",
    )
    .eq("brand_id", brand)
    .is("warehouse_id", null)
    .order("rank_in_brand", { ascending: true });
  if (filter.classFilter && filter.classFilter !== "all") {
    q = q.eq("abc_class", filter.classFilter);
  }
  const { data, error } = await q;
  if (error) throw new Error(`listAbcResults: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const itemIds = Array.from(new Set(rows.map((r) => r.item_id)));
  const { data: items, error: iErr } = await supabase
    .from("items")
    .select("id, code, name")
    .in("id", itemIds);
  if (iErr) throw new Error(`listAbcResults.items: ${iErr.message}`);
  const iMap = new Map((items ?? []).map((i) => [i.id, { code: i.code ?? "", name: i.name ?? "" }]));

  let merged: AbcResultRow[] = rows.map((r) => {
    const it = iMap.get(r.item_id);
    return {
      id: r.id,
      item_id: r.item_id,
      abc_class: toClass(r.abc_class),
      output_amount_12m: Number(r.output_amount_12m ?? 0),
      output_qty_12m: Number(r.output_qty_12m ?? 0),
      rank_in_brand: r.rank_in_brand,
      cum_pct: r.cum_pct == null ? null : Number(r.cum_pct),
      prev_class: r.prev_class,
      recalc_at: r.recalc_at,
      item_code: it?.code ?? "—",
      item_name: it?.name ?? "—",
    };
  });

  if (filter.q) {
    const kw = filter.q.trim().toLowerCase();
    if (kw) {
      merged = merged.filter(
        (r) => r.item_code.toLowerCase().includes(kw) || r.item_name.toLowerCase().includes(kw),
      );
    }
  }
  return merged;
}

export async function getAbcConfig(): Promise<AbcConfigLite | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("abc_classification_config")
    .select(
      "threshold_a_pct, threshold_b_pct, rolling_period_months, count_freq_a_days, count_freq_b_days, count_freq_c_days, last_recalc_at",
    )
    .eq("brand_id", brand)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`getAbcConfig: ${error.message}`);
  if (!data) return null;
  return {
    threshold_a_pct: Number(data.threshold_a_pct ?? 80),
    threshold_b_pct: Number(data.threshold_b_pct ?? 95),
    rolling_period_months: Number(data.rolling_period_months ?? 12),
    count_freq_a_days: Number(data.count_freq_a_days ?? 30),
    count_freq_b_days: Number(data.count_freq_b_days ?? 90),
    count_freq_c_days: Number(data.count_freq_c_days ?? 365),
    last_recalc_at: data.last_recalc_at ?? null,
  };
}

/**
 * 一次撈 ABC 總覽 + 結果（給 page server component 用）。
 */
export async function getAbcOverview(): Promise<AbcOverview> {
  const [config, results] = await Promise.all([getAbcConfig(), listAbcResults()]);

  const counts = { A: 0, B: 0, C: 0, total: results.length };
  const amounts = { A: 0, B: 0, C: 0, total: 0 };
  let changedCount = 0;
  for (const r of results) {
    counts[r.abc_class] += 1;
    amounts[r.abc_class] += r.output_amount_12m;
    amounts.total += r.output_amount_12m;
    if (r.prev_class && r.prev_class !== r.abc_class) changedCount += 1;
  }

  const pct = {
    A: amounts.total > 0 ? (amounts.A / amounts.total) * 100 : 0,
    B: amounts.total > 0 ? (amounts.B / amounts.total) * 100 : 0,
    C: amounts.total > 0 ? (amounts.C / amounts.total) * 100 : 0,
  };
  const typesTotal = counts.total || 1;

  return {
    config,
    counts,
    amounts,
    pct,
    kpi: {
      a: {
        count: counts.A,
        amount: amounts.A,
        pctOfTypes: (counts.A / typesTotal) * 100,
        pctOfAmount: pct.A,
      },
      b: {
        count: counts.B,
        amount: amounts.B,
        pctOfTypes: (counts.B / typesTotal) * 100,
        pctOfAmount: pct.B,
      },
      c: {
        count: counts.C,
        amount: amounts.C,
        pctOfTypes: (counts.C / typesTotal) * 100,
        pctOfAmount: pct.C,
      },
      total: { count: counts.total, amount: amounts.total },
    },
    changedCount,
  };
}

/**
 * 重跑 ABC — proxy 到既有 server action。
 *
 * 紀律：UI 永遠走這支 domain helper、不直接 import `@/lib/parts/actions`。
 */
export async function recalcAbc() {
  return recalcAbcAction();
}

/**
 * Page-level loader：一次回 overview + rows，給 server component 用。
 */
export async function getAbcAnalyticsPageData(filter: {
  classFilter?: AbcClass | "all";
  q?: string;
} = {}): Promise<{
  overview: AbcOverview;
  rows: AbcResultRow[];
}> {
  const [overview, rows] = await Promise.all([
    getAbcOverview(),
    listAbcResults(filter),
  ]);
  return { overview, rows };
}

// ═══════════════════════════════════════════════════════════════════════════
// 庫存周轉率（規格 12_分析報表_庫存周轉率.html）
// ═══════════════════════════════════════════════════════════════════════════

export type TurnoverAction =
  | "preferred_replenish" // 優先補貨（高周轉 A 類）
  | "normal_replenish" // 正常補貨
  | "watch" // 觀察補貨
  | "stop_replenish" // 停止補貨
  | "clearance"; // 建議清倉

export type TurnoverRow = {
  item_id: string;
  item_code: string;
  item_name: string;
  category: string | null;
  abc_class: AbcClass | null;
  /** 12M 累積出庫量（取自 abc_classification_results） */
  out_qty_12m: number;
  /** 12M 累積出庫金額 */
  out_amount_12m: number;
  /** 期末庫存（stock_items 加總） */
  ending_qty: number;
  /** 占用成本（ending_qty × unit_cost 加總） */
  ending_value: number;
  /** 倒推期初庫存 = ending + out - in（12M 入庫） */
  beginning_qty_estimated: number;
  /** 周轉率 = out_qty_12m / 平均庫存（(beginning+ending)/2）；ending=0 但有 out → Infinity 標 999 */
  turnover_ratio: number;
  /** 周轉天數 = 365 / turnover_ratio（>999 視為 ∞） */
  turnover_days: number | null;
  /** 客戶端建議動作 */
  suggested_action: TurnoverAction;
};

export type TurnoverMonthBucket = {
  /** YYYY-MM */
  month: string;
  out_qty: number;
  out_amount: number;
};

export type TurnoverOverview = {
  /** 整體周轉率 = ΣoutQty12m / Σending */
  overall_ratio: number;
  /** 整體周轉天數 */
  overall_days: number | null;
  /** A/B/C 平均周轉率（per-item average） */
  class_avg: { A: number; B: number; C: number };
  /** A/B/C 平均周轉率達標標記（目標 A≥10、B≥5、C≥2，跟規格 HTML 一致） */
  class_target: { A: number; B: number; C: number };
  /** A/B/C 件數 */
  class_count: { A: number; B: number; C: number };
  /** 月度趨勢（近 6 個月）— 取自 stock_issues.issue_date group by month */
  monthly_trend: TurnoverMonthBucket[];
  /** 統計範圍：總料號數 / 有 ABC 分類數 */
  total_items: number;
  classified_items: number;
};

const TURNOVER_CLASS_TARGETS = { A: 10, B: 5, C: 2 } as const;

function suggestAction(ratio: number, abc: AbcClass | null): TurnoverAction {
  if (ratio === 0) return "clearance"; // 零出貨直接清倉
  if (ratio < 1) return "clearance";
  if (ratio < 3) {
    return abc === "C" ? "stop_replenish" : "watch";
  }
  if (ratio < 8) return "normal_replenish";
  return "preferred_replenish";
}

/**
 * Brand-level 庫存周轉率明細：每 item 一行。
 *
 * 演算法：
 *   - 從 abc_classification_results 取 output_qty_12m / output_amount_12m / abc_class
 *     （已 pre-aggregated by daily/manual recalc）
 *   - 從 stock_items 加總 qty / value（期末庫存）
 *   - 從 stock_receipt_lines 加總 12M 入庫量（倒推期初）
 *   - 周轉率用「平均庫存」分母：(期初+期末)/2；期初為 0 fallback 用 ending
 *
 * 限制：
 *   - 期初是「倒推」不是 snapshot，準度依賴 12M 區間出入庫資料完整性
 *   - 缺單一倉維度（aggregate by brand）；門店維度待 sprint 2
 */
export async function listTurnoverRows(filter: {
  classFilter?: AbcClass | "all";
  q?: string;
} = {}): Promise<TurnoverRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const now = new Date();
  const since12m = new Date(now);
  since12m.setMonth(since12m.getMonth() - 12);
  const sinceIso = since12m.toISOString();

  const [abcRes, stockRes, itemsRes, receiptsRes] = await Promise.all([
    supabase
      .from("abc_classification_results")
      .select("item_id, abc_class, output_qty_12m, output_amount_12m")
      .eq("brand_id", brand)
      .is("warehouse_id", null),
    supabase
      .from("stock_items")
      .select("item_id, qty, unit_cost")
      .eq("brand_id", brand),
    supabase
      .from("items")
      .select("id, code, name, category")
      .eq("brand_id", brand)
      .eq("is_active", true),
    supabase
      .from("stock_receipt_lines")
      .select("item_id, qty_received, created_at")
      .eq("brand_id", brand)
      .gte("created_at", sinceIso),
  ]);
  if (abcRes.error) throw new Error(`listTurnoverRows.abc: ${abcRes.error.message}`);
  if (stockRes.error) throw new Error(`listTurnoverRows.stock: ${stockRes.error.message}`);
  if (itemsRes.error) throw new Error(`listTurnoverRows.items: ${itemsRes.error.message}`);
  if (receiptsRes.error) throw new Error(`listTurnoverRows.receipts: ${receiptsRes.error.message}`);

  const abcByItem = new Map<string, { abc: AbcClass; outQty: number; outAmount: number }>();
  for (const r of abcRes.data ?? []) {
    abcByItem.set(r.item_id, {
      abc: toClass(r.abc_class),
      outQty: Number(r.output_qty_12m ?? 0),
      outAmount: Number(r.output_amount_12m ?? 0),
    });
  }
  const stockByItem = new Map<string, { qty: number; value: number }>();
  for (const s of stockRes.data ?? []) {
    const cur = stockByItem.get(s.item_id) ?? { qty: 0, value: 0 };
    cur.qty += Number(s.qty ?? 0);
    cur.value += Number(s.qty ?? 0) * Number(s.unit_cost ?? 0);
    stockByItem.set(s.item_id, cur);
  }
  const inByItem = new Map<string, number>();
  for (const r of receiptsRes.data ?? []) {
    inByItem.set(r.item_id, (inByItem.get(r.item_id) ?? 0) + Number(r.qty_received ?? 0));
  }

  const rows: TurnoverRow[] = [];
  for (const it of itemsRes.data ?? []) {
    const a = abcByItem.get(it.id);
    const stk = stockByItem.get(it.id) ?? { qty: 0, value: 0 };
    const outQty = a?.outQty ?? 0;
    const outAmount = a?.outAmount ?? 0;
    const inQty = inByItem.get(it.id) ?? 0;

    // 期初 = 期末 + 出庫 − 入庫（倒推）
    const beginning = Math.max(0, stk.qty + outQty - inQty);
    const avgStock = (beginning + stk.qty) / 2;
    let ratio = 0;
    if (avgStock > 0) {
      ratio = outQty / avgStock;
    } else if (outQty > 0) {
      ratio = 999; // 期末=0 但有出貨 → 超高周轉
    }
    if (!Number.isFinite(ratio)) ratio = 999;

    // 只保留「有業務動作」的行：12M 有出貨 / 期末有庫存 / 有 ABC 分類
    if (outQty === 0 && stk.qty === 0 && !a) continue;

    const turnoverDays = ratio > 0 ? 365 / ratio : null;

    rows.push({
      item_id: it.id,
      item_code: it.code ?? "—",
      item_name: it.name ?? "—",
      category: it.category ?? null,
      abc_class: a?.abc ?? null,
      out_qty_12m: outQty,
      out_amount_12m: outAmount,
      ending_qty: stk.qty,
      ending_value: Math.round(stk.value),
      beginning_qty_estimated: beginning,
      turnover_ratio: Math.round(ratio * 100) / 100,
      turnover_days: turnoverDays != null ? Math.round(turnoverDays) : null,
      suggested_action: suggestAction(ratio, a?.abc ?? null),
    });
  }

  let filtered = rows;
  if (filter.classFilter && filter.classFilter !== "all") {
    filtered = filtered.filter((r) => r.abc_class === filter.classFilter);
  }
  if (filter.q) {
    const kw = filter.q.trim().toLowerCase();
    if (kw) {
      filtered = filtered.filter(
        (r) =>
          r.item_code.toLowerCase().includes(kw) ||
          r.item_name.toLowerCase().includes(kw),
      );
    }
  }
  // 預設：周轉率低到高（規格的「低周轉率優先」）
  filtered.sort((a, b) => a.turnover_ratio - b.turnover_ratio);
  return filtered;
}

/**
 * 近 6 個月出庫趨勢 — 用 stock_issues.issue_date group by month。
 */
async function getMonthlyTurnoverTrend(): Promise<TurnoverMonthBucket[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const now = new Date();
  const since = new Date(now);
  since.setMonth(since.getMonth() - 6);
  since.setDate(1);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("stock_issues")
    .select("issue_date, qty_issued_total, amount_total")
    .eq("brand_id", brand)
    .gte("issue_date", sinceIso);
  if (error) throw new Error(`getMonthlyTurnoverTrend: ${error.message}`);

  const bucketMap = new Map<string, { qty: number; amount: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    bucketMap.set(key, { qty: 0, amount: 0 });
  }
  for (const r of data ?? []) {
    if (!r.issue_date) continue;
    const key = r.issue_date.slice(0, 7); // YYYY-MM
    const cur = bucketMap.get(key);
    if (!cur) continue; // 超出 6 個月窗口
    cur.qty += Number(r.qty_issued_total ?? 0);
    cur.amount += Number(r.amount_total ?? 0);
  }

  return Array.from(bucketMap.entries()).map(([month, v]) => ({
    month,
    out_qty: v.qty,
    out_amount: v.amount,
  }));
}

/**
 * Turnover overview — KPI + class avg + 月趨勢。
 */
export async function getTurnoverOverview(rows: TurnoverRow[]): Promise<TurnoverOverview> {
  const monthly = await getMonthlyTurnoverTrend();

  let sumOut = 0;
  let sumEnd = 0;
  const classAcc: Record<AbcClass, { sum: number; n: number }> = {
    A: { sum: 0, n: 0 },
    B: { sum: 0, n: 0 },
    C: { sum: 0, n: 0 },
  };
  let classified = 0;
  for (const r of rows) {
    sumOut += r.out_qty_12m;
    sumEnd += r.ending_qty;
    if (r.abc_class) {
      classified += 1;
      classAcc[r.abc_class].sum += r.turnover_ratio;
      classAcc[r.abc_class].n += 1;
    }
  }
  const overallRatio = sumEnd > 0 ? Math.round((sumOut / sumEnd) * 100) / 100 : 0;
  const overallDays = overallRatio > 0 ? Math.round(365 / overallRatio) : null;

  return {
    overall_ratio: overallRatio,
    overall_days: overallDays,
    class_avg: {
      A: classAcc.A.n > 0 ? Math.round((classAcc.A.sum / classAcc.A.n) * 10) / 10 : 0,
      B: classAcc.B.n > 0 ? Math.round((classAcc.B.sum / classAcc.B.n) * 10) / 10 : 0,
      C: classAcc.C.n > 0 ? Math.round((classAcc.C.sum / classAcc.C.n) * 10) / 10 : 0,
    },
    class_target: { ...TURNOVER_CLASS_TARGETS },
    class_count: { A: classAcc.A.n, B: classAcc.B.n, C: classAcc.C.n },
    monthly_trend: monthly,
    total_items: rows.length,
    classified_items: classified,
  };
}

/**
 * Page-level loader：一次回 overview + rows。
 */
export async function getTurnoverPageData(filter: {
  classFilter?: AbcClass | "all";
  q?: string;
} = {}): Promise<{
  overview: TurnoverOverview;
  rows: TurnoverRow[];
}> {
  const rows = await listTurnoverRows(filter);
  const overview = await getTurnoverOverview(rows);
  return { overview, rows };
}

// ═══════════════════════════════════════════════════════════════════════════
// 呆滯庫存（規格 12_分析報表_呆滯庫存.html）
// ═══════════════════════════════════════════════════════════════════════════

export type StaleReasonCode =
  | "discontinued" // 停產車型 / 商品已下架
  | "overstock" // 採購過量
  | "rev_change" // 規格改版（目前無 schema 訊號，保留 placeholder）
  | "other";

export type StaleBucketKey = "b90_180" | "b180_365" | "b365_plus";

export type StaleSuggestedAction =
  | "scrap" // 申請報廢
  | "promote" // 移促銷倉
  | "transfer" // 跨店調撥
  | "watch"; // 觀察

export type StaleRow = {
  item_id: string;
  item_code: string;
  item_name: string;
  category: string | null;
  control_type: string | null;
  abc_class: AbcClass | null;
  /** 期末庫存 */
  qty: number;
  /** 占用成本（qty × unit_cost 加總） */
  value: number;
  /** per-item 最近一次出庫（stock_issues.issue_date max；fallback last_movement_at） */
  last_issue_date: string | null;
  /** 閒置天數，必 ≥ 90 */
  days_idle: number;
  reason_code: StaleReasonCode;
  reason_label: string;
  suggested_action: StaleSuggestedAction;
  bucket: StaleBucketKey;
};

export type StaleOverview = {
  /** 呆滯料金額 */
  total_stale_value: number;
  /** 總庫存金額（含非呆滯） */
  total_inventory_value: number;
  /** 呆滯料號數 */
  total_stale_count: number;
  /** 總 SKU 數（有庫存或 12M 內有異動） */
  total_sku_count: number;
  /** 180 天+件數 */
  severe_count: number;
  /** 過去 30 天剛跨入呆滯（days_idle ∈ [90, 120]） */
  new_this_month: number;
  /** 三段呆滯分佈 */
  buckets: Record<StaleBucketKey, number>;
  /** 原因聚合 */
  reasons: Array<{
    code: StaleReasonCode;
    label: string;
    count: number;
  }>;
};

const STALE_REASON_LABELS: Record<StaleReasonCode, string> = {
  discontinued: "停產車型",
  overstock: "採購過量",
  rev_change: "規格改版",
  other: "其他",
};

function bucketOf(days: number): StaleBucketKey {
  if (days >= 365) return "b365_plus";
  if (days >= 180) return "b180_365";
  return "b90_180";
}

function actionOf(
  reason: StaleReasonCode,
  bucket: StaleBucketKey,
): StaleSuggestedAction {
  if (reason === "discontinued") return "scrap";
  if (bucket === "b365_plus") return "scrap";
  if (bucket === "b180_365") return "promote";
  // 90-180 採購過量 → 跨店調撥；其他 → 觀察
  if (reason === "overstock") return "transfer";
  return "watch";
}

/**
 * 呆滯料明細：閒置 ≥ 90 天的料號清單。
 *
 * 演算法：
 *   1. 抓 brand 內所有 stock_items qty > 0 → 期末庫存 / 占用成本 / last_movement_at（per-batch max）
 *   2. 抓 12M 內 stock_issue_lines × stock_issues.issue_date → per-item MAX(issue_date)
 *   3. 抓 12M 入庫量（stock_receipt_lines）→ 判定「採購過量」
 *   4. days_idle = (NOW - max(issue_date, last_movement_at)) / 86400000
 *      - 若兩者都 null（從未異動），days_idle 視為一個很大的數（取 999），bucket = b365_plus
 *      - days_idle < 90 → 排除
 *   5. 原因規則（heuristic，順序就是優先序）：
 *      - items.is_active = false → discontinued
 *      - 12M 入庫量 ≥ 12M 出庫量 × 3 且 stock > 0 → overstock
 *      - 否則 → other（rev_change 留未來擴充，目前 schema 沒訊號）
 *
 * 限制 / caveat（UI 要顯示）：
 *   - last_issue_date 只看 stock_issues，沒包含 stock_transfers（調撥）；
 *     若一筆料只調撥沒出貨會被誤判呆滯。後續可改加 transfer_lines。
 *   - 原因分類是 heuristic、非業務手動標記。
 */
export async function listStaleRows(filter: {
  bucket?: StaleBucketKey | "all";
  abc?: AbcClass | "all";
  reason?: StaleReasonCode | "all";
  q?: string;
} = {}): Promise<StaleRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const now = new Date();
  const since12m = new Date(now);
  since12m.setMonth(since12m.getMonth() - 12);
  const sinceIso = since12m.toISOString();
  const sinceDate = sinceIso.slice(0, 10);
  const nowMs = now.getTime();

  const [stockRes, itemsRes, abcRes, issueLinesRes, receiptsRes] =
    await Promise.all([
      supabase
        .from("stock_items")
        .select("item_id, qty, unit_cost, last_movement_at")
        .eq("brand_id", brand)
        .gt("qty", 0),
      supabase
        .from("items")
        .select("id, code, name, category, control_type, is_active")
        .eq("brand_id", brand),
      supabase
        .from("abc_classification_results")
        .select("item_id, abc_class")
        .eq("brand_id", brand)
        .is("warehouse_id", null),
      // 12M 內 issue_lines × issues.issue_date —— 用 inner join 撈出每行的 issue_date
      supabase
        .from("stock_issue_lines")
        .select("item_id, qty_issued, stock_issues!inner(issue_date)")
        .eq("brand_id", brand)
        .gte("stock_issues.issue_date", sinceDate),
      supabase
        .from("stock_receipt_lines")
        .select("item_id, qty_received, created_at")
        .eq("brand_id", brand)
        .gte("created_at", sinceIso),
    ]);
  if (stockRes.error) throw new Error(`listStaleRows.stock: ${stockRes.error.message}`);
  if (itemsRes.error) throw new Error(`listStaleRows.items: ${itemsRes.error.message}`);
  if (abcRes.error) throw new Error(`listStaleRows.abc: ${abcRes.error.message}`);
  if (issueLinesRes.error) throw new Error(`listStaleRows.issues: ${issueLinesRes.error.message}`);
  if (receiptsRes.error) throw new Error(`listStaleRows.receipts: ${receiptsRes.error.message}`);

  // ── aggregate stock ──
  const stockByItem = new Map<
    string,
    { qty: number; value: number; lastMove: string | null }
  >();
  for (const s of stockRes.data ?? []) {
    const cur = stockByItem.get(s.item_id) ?? { qty: 0, value: 0, lastMove: null };
    cur.qty += Number(s.qty ?? 0);
    cur.value += Number(s.qty ?? 0) * Number(s.unit_cost ?? 0);
    if (s.last_movement_at && (!cur.lastMove || s.last_movement_at > cur.lastMove)) {
      cur.lastMove = s.last_movement_at;
    }
    stockByItem.set(s.item_id, cur);
  }

  // ── per-item MAX(issue_date) + 12M out qty ──
  const issueByItem = new Map<string, { lastIssue: string | null; outQty12m: number }>();
  for (const line of issueLinesRes.data ?? []) {
    // supabase nested select 在 type 上是 array；inner join 後通常單筆，但保險取第一筆
    const joined = (line as { stock_issues: unknown }).stock_issues;
    const issueDate = Array.isArray(joined)
      ? (joined[0] as { issue_date?: string } | undefined)?.issue_date ?? null
      : (joined as { issue_date?: string } | null)?.issue_date ?? null;
    const cur = issueByItem.get(line.item_id) ?? { lastIssue: null, outQty12m: 0 };
    cur.outQty12m += Number(line.qty_issued ?? 0);
    if (issueDate && (!cur.lastIssue || issueDate > cur.lastIssue)) {
      cur.lastIssue = issueDate;
    }
    issueByItem.set(line.item_id, cur);
  }

  // ── 12M in qty ──
  const inByItem = new Map<string, number>();
  for (const r of receiptsRes.data ?? []) {
    inByItem.set(r.item_id, (inByItem.get(r.item_id) ?? 0) + Number(r.qty_received ?? 0));
  }

  const abcByItem = new Map<string, AbcClass>();
  for (const a of abcRes.data ?? []) {
    abcByItem.set(a.item_id, toClass(a.abc_class));
  }

  // ── build rows ──
  const rows: StaleRow[] = [];
  for (const it of itemsRes.data ?? []) {
    const stk = stockByItem.get(it.id);
    if (!stk || stk.qty <= 0) continue; // 沒庫存就無所謂呆滯

    const issue = issueByItem.get(it.id);
    const inQty = inByItem.get(it.id) ?? 0;
    const lastIssueDate = issue?.lastIssue ?? null;
    const outQty12m = issue?.outQty12m ?? 0;

    // days_idle 取 max(stock 最後異動、最近出貨)
    let lastActivityMs: number | null = null;
    if (lastIssueDate) {
      lastActivityMs = new Date(lastIssueDate).getTime();
    }
    if (stk.lastMove) {
      const stkMs = new Date(stk.lastMove).getTime();
      if (lastActivityMs == null || stkMs > lastActivityMs) {
        lastActivityMs = stkMs;
      }
    }

    let daysIdle: number;
    if (lastActivityMs == null) {
      daysIdle = 999; // 從未異動 → 視為超久
    } else {
      daysIdle = Math.floor((nowMs - lastActivityMs) / 86_400_000);
    }
    if (daysIdle < 90) continue;

    // 原因判定
    let reason: StaleReasonCode;
    if (it.is_active === false) {
      reason = "discontinued";
    } else if (outQty12m > 0 && inQty >= outQty12m * 3) {
      reason = "overstock";
    } else if (outQty12m === 0 && inQty > 0) {
      // 進貨進來但完全沒出，當作過量採購
      reason = "overstock";
    } else {
      reason = "other";
    }

    const bucket = bucketOf(daysIdle);

    rows.push({
      item_id: it.id,
      item_code: it.code ?? "—",
      item_name: it.name ?? "—",
      category: it.category ?? null,
      control_type: it.control_type ?? null,
      abc_class: abcByItem.get(it.id) ?? null,
      qty: stk.qty,
      value: Math.round(stk.value),
      last_issue_date: lastIssueDate,
      days_idle: daysIdle,
      reason_code: reason,
      reason_label: STALE_REASON_LABELS[reason],
      suggested_action: actionOf(reason, bucket),
      bucket,
    });
  }

  // filter
  let filtered = rows;
  if (filter.bucket && filter.bucket !== "all") {
    filtered = filtered.filter((r) => r.bucket === filter.bucket);
  }
  if (filter.abc && filter.abc !== "all") {
    filtered = filtered.filter((r) => r.abc_class === filter.abc);
  }
  if (filter.reason && filter.reason !== "all") {
    filtered = filtered.filter((r) => r.reason_code === filter.reason);
  }
  if (filter.q) {
    const kw = filter.q.trim().toLowerCase();
    if (kw) {
      filtered = filtered.filter(
        (r) =>
          r.item_code.toLowerCase().includes(kw) ||
          r.item_name.toLowerCase().includes(kw),
      );
    }
  }

  // 預設排序：閒置天數高→低
  filtered.sort((a, b) => b.days_idle - a.days_idle);
  return filtered;
}

/**
 * 呆滯庫存 overview：KPI + bucket + reasons。
 *
 * 也計算「總庫存金額」+「總 SKU 數」當基準（給佔比 KPI 用）。
 */
export async function getStaleOverview(): Promise<{
  overview: StaleOverview;
  rows: StaleRow[];
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 1) 全 brand 總庫存金額 / SKU 數（不限呆滯）
  const totalsRes = await supabase
    .from("stock_items")
    .select("item_id, qty, unit_cost")
    .eq("brand_id", brand)
    .gt("qty", 0);
  if (totalsRes.error) throw new Error(`getStaleOverview.totals: ${totalsRes.error.message}`);

  let totalInventoryValue = 0;
  const totalSkuSet = new Set<string>();
  for (const s of totalsRes.data ?? []) {
    totalInventoryValue += Number(s.qty ?? 0) * Number(s.unit_cost ?? 0);
    totalSkuSet.add(s.item_id);
  }

  // 2) 呆滯明細
  const rows = await listStaleRows();

  // 3) 聚合 KPI
  let totalStaleValue = 0;
  let severeCount = 0;
  let newThisMonth = 0;
  const buckets: Record<StaleBucketKey, number> = {
    b90_180: 0,
    b180_365: 0,
    b365_plus: 0,
  };
  const reasonCount = new Map<StaleReasonCode, number>();
  for (const r of rows) {
    totalStaleValue += r.value;
    buckets[r.bucket] += 1;
    if (r.days_idle >= 180) severeCount += 1;
    if (r.days_idle >= 90 && r.days_idle <= 120) newThisMonth += 1;
    reasonCount.set(r.reason_code, (reasonCount.get(r.reason_code) ?? 0) + 1);
  }

  const reasons = (Object.keys(STALE_REASON_LABELS) as StaleReasonCode[])
    .map((code) => ({
      code,
      label: STALE_REASON_LABELS[code],
      count: reasonCount.get(code) ?? 0,
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    overview: {
      total_stale_value: Math.round(totalStaleValue),
      total_inventory_value: Math.round(totalInventoryValue),
      total_stale_count: rows.length,
      total_sku_count: totalSkuSet.size,
      severe_count: severeCount,
      new_this_month: newThisMonth,
      buckets,
      reasons,
    },
    rows,
  };
}

/**
 * Page-level loader：一次回 overview + rows。
 *
 * 注意：getStaleOverview 已經跑了 listStaleRows，這裡 filter 只用在 UI 端
 * 的「再次篩選」上（avoiding double round-trip）。Page server component 拿
 * rows 後傳給 client board，client board 自己 filter。
 */
export async function getStaleAnalyticsPageData(): Promise<{
  overview: StaleOverview;
  rows: StaleRow[];
}> {
  return getStaleOverview();
}

// ═══════════════════════════════════════════════════════════════════════════
// ABC 結構圖（規格 12_分析報表_ABC結構圖.html）
// ═══════════════════════════════════════════════════════════════════════════
//
// 純讀取頁，沒有寫入。Reuse listAbcResults() / getAbcOverview() 的結果，
// 再算出三個視覺化區塊需要的資料：
//   - Pareto curve（料號累計 % vs 金額累計 %）
//   - Period compare（本期 vs 上期 — 用 prev_class 反推）
//   - Changes（prev_class != abc_class 的 diff 列表）

export type AbcStructureRow = {
  rank: number | null;
  item_id: string;
  item_code: string;
  item_name: string;
  abc_class: AbcClass;
  prev_class: AbcClass | null;
  output_amount_12m: number;
  output_qty_12m: number;
  cum_pct: number | null;
};

export type AbcStructureChangeRow = {
  item_id: string;
  item_code: string;
  item_name: string;
  prev_class: AbcClass;
  abc_class: AbcClass;
  /** 'up' = B→A / C→B / C→A；'down' = A→B / B→C / A→C */
  direction: "up" | "down";
  output_amount_12m: number;
};

export type AbcStructureParetoPoint = {
  /** 料號累計 % (0-100) */
  x: number;
  /** 金額累計 % (0-100) */
  y: number;
};

export type AbcStructurePareto = {
  curve: AbcStructureParetoPoint[];
  /** A 切點（rank_in_brand 之 abc_class 最後一筆 A） */
  cut_a: AbcStructureParetoPoint | null;
  /** B 切點（最後一筆 B） */
  cut_b: AbcStructureParetoPoint | null;
};

export type AbcStructurePeriodCompare = {
  current: { A: number; B: number; C: number };
  /** prev_class 反推上次的計數；null 視為 unclassified */
  prev: { A: number; B: number; C: number; unclassified: number };
};

export type AbcStructurePageData = {
  overview: AbcOverview;
  pareto: AbcStructurePareto;
  rows: AbcStructureRow[];
  changes: AbcStructureChangeRow[];
  period_compare: AbcStructurePeriodCompare;
};

const CLASS_ORDER: Record<AbcClass, number> = { A: 3, B: 2, C: 1 };

function classDirection(prev: AbcClass, cur: AbcClass): "up" | "down" {
  return CLASS_ORDER[cur] > CLASS_ORDER[prev] ? "up" : "down";
}

function buildPareto(rows: AbcStructureRow[]): AbcStructurePareto {
  // 排序：rank_in_brand 由小到大；rank null 排最後
  const sorted = [...rows].sort((a, b) => {
    const ra = a.rank ?? Number.POSITIVE_INFINITY;
    const rb = b.rank ?? Number.POSITIVE_INFINITY;
    return ra - rb;
  });
  const totalCount = sorted.length;
  const totalAmount = sorted.reduce((s, r) => s + r.output_amount_12m, 0);
  if (totalCount === 0 || totalAmount === 0) {
    return { curve: [], cut_a: null, cut_b: null };
  }

  // 為了不要 SVG path 太多點，做最多 100 點 down-sample
  const targetPoints = Math.min(totalCount, 100);
  const step = Math.max(1, Math.floor(totalCount / targetPoints));

  const curve: AbcStructureParetoPoint[] = [{ x: 0, y: 0 }];
  let cumAmount = 0;
  let lastA: AbcStructureParetoPoint | null = null;
  let lastB: AbcStructureParetoPoint | null = null;
  for (let i = 0; i < totalCount; i++) {
    const r = sorted[i];
    cumAmount += r.output_amount_12m;
    const x = ((i + 1) / totalCount) * 100;
    const y = (cumAmount / totalAmount) * 100;
    if (r.abc_class === "A") lastA = { x, y };
    if (r.abc_class === "B") lastB = { x, y };
    if (i === totalCount - 1 || i % step === 0) {
      curve.push({ x, y });
    }
  }

  return {
    curve,
    cut_a: lastA,
    cut_b: lastB,
  };
}

/**
 * Page-level loader：算 pareto / period compare / changes。
 */
export async function getAbcStructurePageData(): Promise<AbcStructurePageData> {
  const [overview, abcRows] = await Promise.all([
    getAbcOverview(),
    listAbcResults(),
  ]);

  const rows: AbcStructureRow[] = abcRows.map((r) => ({
    rank: r.rank_in_brand,
    item_id: r.item_id,
    item_code: r.item_code,
    item_name: r.item_name,
    abc_class: r.abc_class,
    prev_class:
      r.prev_class === "A" || r.prev_class === "B" || r.prev_class === "C"
        ? (r.prev_class as AbcClass)
        : null,
    output_amount_12m: r.output_amount_12m,
    output_qty_12m: r.output_qty_12m,
    cum_pct: r.cum_pct,
  }));

  const pareto = buildPareto(rows);

  const current = { A: 0, B: 0, C: 0 };
  const prev = { A: 0, B: 0, C: 0, unclassified: 0 };
  const changes: AbcStructureChangeRow[] = [];
  for (const r of rows) {
    current[r.abc_class] += 1;
    if (r.prev_class == null) {
      prev.unclassified += 1;
    } else {
      prev[r.prev_class] += 1;
      if (r.prev_class !== r.abc_class) {
        changes.push({
          item_id: r.item_id,
          item_code: r.item_code,
          item_name: r.item_name,
          prev_class: r.prev_class,
          abc_class: r.abc_class,
          direction: classDirection(r.prev_class, r.abc_class),
          output_amount_12m: r.output_amount_12m,
        });
      }
    }
  }
  // 變動記錄按 12M 金額由大到小 — 重要的先看
  changes.sort((a, b) => b.output_amount_12m - a.output_amount_12m);

  return {
    overview,
    pareto,
    rows,
    changes,
    period_compare: { current, prev },
  };
}

// ─────────────────────────── ABC settings page（/parts/analytics/abc-settings） ───────────────────────────

import type { AbcConfig } from "@/domain/parts-abc.constants";

export async function getAbcSettingsPageData(): Promise<AbcConfig | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("abc_classification_config")
    .select(
      "id, brand_id, recalc_trigger, rolling_period_months, threshold_a_pct, threshold_b_pct, count_freq_a_days, count_freq_b_days, count_freq_c_days, safety_stock_days_a, safety_stock_days_b, safety_stock_days_c, new_item_default_class, new_item_grace_months, last_recalc_at, is_active",
    )
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) throw new Error(`abc-config: ${error.message}`);
  return (data ?? null) as unknown as AbcConfig | null;
}

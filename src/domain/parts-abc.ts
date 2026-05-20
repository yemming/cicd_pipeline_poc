"use server";

/**
 * Domain Helper — ABC 分類設定 dry-run simulation。
 *
 * 範圍：
 *   - 讀取當前 brand 的 ABC config（thresholds）
 *   - 提供 dry-run simulation：以新 thresholds + metric 重新計算分類，
 *     不寫 DB，回傳 before/after bucket counts + 變動清單
 *   - applyAbcConfig：正式寫 abc_classification_config（thresholds）+
 *     回寫每筆 abc_classification_results.prev_class/abc_class
 *
 * 對應頁面：`/parts/analytics/abc-settings`
 *
 * 設計取捨：
 *   - 不新建 abc_thresholds 表，沿用既有 abc_classification_config 的 threshold_a_pct/b_pct
 *   - metric=profit 暫無資料（items 沒掛毛利），UI 標 disabled；server 收到也 fallback 到 revenue
 *   - simulation 「真實重算 cum_pct」（按金額 / 數量 desc 排序），不是只用既有 cum_pct 切點
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type {
  AbcClass,
  AbcConfig,
  AbcMetric,
  AbcSimulationBuckets,
  AbcSimulationChange,
  AbcSimulationInput,
  AbcSimulationResult,
} from "./parts-abc.constants";
import { classifyByCumPct, DEFAULT_ABC_THRESHOLDS } from "./parts-abc.constants";

function toClass(v: string | null | undefined): AbcClass {
  return v === "A" || v === "B" ? v : "C";
}

function emptyBuckets(): AbcSimulationBuckets {
  return {
    A: { count: 0, amount: 0 },
    B: { count: 0, amount: 0 },
    C: { count: 0, amount: 0 },
    total: { count: 0, amount: 0 },
  };
}

function addToBucket(buckets: AbcSimulationBuckets, cls: AbcClass, amount: number) {
  buckets[cls].count += 1;
  buckets[cls].amount += amount;
  buckets.total.count += 1;
  buckets.total.amount += amount;
}

/** 抓當前 brand 的完整 config（給 page 用）。沒有則回 null。 */
export async function getAbcConfig(): Promise<AbcConfig | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("abc_classification_config")
    .select(
      "id, brand_id, recalc_trigger, rolling_period_months, threshold_a_pct, threshold_b_pct, count_freq_a_days, count_freq_b_days, count_freq_c_days, safety_stock_days_a, safety_stock_days_b, safety_stock_days_c, new_item_default_class, new_item_grace_months, last_recalc_at, is_active",
    )
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) throw new Error(`getAbcConfig: ${error.message}`);
  return (data ?? null) as unknown as AbcConfig | null;
}

/**
 * Dry-run：用新 thresholds + metric 重新分類每個 result row，與當前 abc_class 對比，
 * 回傳 before/after bucket + 異動清單。不寫 DB。
 */
export async function getAbcSimulation(input: AbcSimulationInput): Promise<AbcSimulationResult> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 整理輸入（防呆）
  const a_percentile = Math.min(99, Math.max(1, Number(input.a_percentile) || DEFAULT_ABC_THRESHOLDS.a_percentile));
  const b_percentile = Math.min(100, Math.max(a_percentile + 0.01, Number(input.b_percentile) || DEFAULT_ABC_THRESHOLDS.b_percentile));
  const metric: AbcMetric = input.metric === "qty" ? "qty" : "revenue"; // profit fallback → revenue

  const { data: rows, error } = await supabase
    .from("abc_classification_results")
    .select("id, item_id, abc_class, output_amount_12m, output_qty_12m")
    .eq("brand_id", brand)
    .is("warehouse_id", null);
  if (error) throw new Error(`getAbcSimulation: ${error.message}`);

  const safeRows = (rows ?? []).map((r) => ({
    id: r.id as string,
    item_id: r.item_id as string,
    current_class: toClass(r.abc_class as string | null),
    amount: Number(r.output_amount_12m ?? 0),
    qty: Number(r.output_qty_12m ?? 0),
  }));

  if (safeRows.length === 0) {
    return {
      before: emptyBuckets(),
      after: emptyBuckets(),
      changes: [],
      metric,
      a_percentile,
      b_percentile,
    };
  }

  // 拉 item 名稱
  const itemIds = Array.from(new Set(safeRows.map((r) => r.item_id)));
  const { data: items, error: itemsErr } = await supabase
    .from("items")
    .select("id, code, name")
    .in("id", itemIds);
  if (itemsErr) throw new Error(`getAbcSimulation.items: ${itemsErr.message}`);
  const itemMap = new Map(
    (items ?? []).map((i) => [i.id as string, { code: (i.code as string) ?? "—", name: (i.name as string) ?? "—" }]),
  );

  // 排序：依 metric desc
  const scored = safeRows.map((r) => ({ ...r, score: metric === "qty" ? r.qty : r.amount }));
  scored.sort((a, b) => b.score - a.score);

  const totalScore = scored.reduce((s, r) => s + r.score, 0);

  // 累積百分比 → 新分類
  const before = emptyBuckets();
  const after = emptyBuckets();
  const changes: AbcSimulationChange[] = [];
  let cum = 0;

  for (const r of scored) {
    const cum_pct = totalScore > 0 ? ((cum + r.score) / totalScore) * 100 : 100;
    const newClass = classifyByCumPct(cum_pct, a_percentile, b_percentile);
    cum += r.score;

    addToBucket(before, r.current_class, r.amount);
    addToBucket(after, newClass, r.amount);

    if (newClass !== r.current_class) {
      const info = itemMap.get(r.item_id);
      changes.push({
        item_id: r.item_id,
        item_code: info?.code ?? "—",
        item_name: info?.name ?? "—",
        output_amount_12m: r.amount,
        output_qty_12m: r.qty,
        from: r.current_class,
        to: newClass,
      });
    }
  }

  // 變動清單依 from → to 排序，A↓ 最重要
  const order: Record<AbcClass, number> = { A: 0, B: 1, C: 2 };
  changes.sort((a, b) => {
    const d = order[a.to] - order[b.to];
    if (d !== 0) return d;
    return order[a.from] - order[b.from];
  });

  return { before, after, changes, metric, a_percentile, b_percentile };
}

/**
 * 正式套用：更新 config thresholds + 回寫 abc_classification_results 的 prev_class / abc_class。
 * 回傳影響的 item 數量。
 */
export async function applyAbcConfig(input: AbcSimulationInput): Promise<{ affected: number }> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const sim = await getAbcSimulation(input);

  // 1. 更新 thresholds
  const { data: existing } = await supabase
    .from("abc_classification_config")
    .select("id")
    .eq("brand_id", brand)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("abc_classification_config")
      .update({
        threshold_a_pct: sim.a_percentile,
        threshold_b_pct: sim.b_percentile,
        last_recalc_at: new Date().toISOString(),
      })
      .eq("brand_id", brand);
    if (error) throw new Error(`applyAbcConfig.config: ${error.message}`);
  } else {
    const { error } = await supabase.from("abc_classification_config").insert({
      brand_id: brand,
      threshold_a_pct: sim.a_percentile,
      threshold_b_pct: sim.b_percentile,
      last_recalc_at: new Date().toISOString(),
    });
    if (error) throw new Error(`applyAbcConfig.config.insert: ${error.message}`);
  }

  // 2. 回寫 results（只更新有變動的 row，省 round-trip）
  if (sim.changes.length === 0) return { affected: 0 };

  // 批次更新：一條一條 update（results 量小，POC 階段可接受）
  for (const ch of sim.changes) {
    const { error } = await supabase
      .from("abc_classification_results")
      .update({ prev_class: ch.from, abc_class: ch.to, updated_at: new Date().toISOString() })
      .eq("brand_id", brand)
      .eq("item_id", ch.item_id)
      .is("warehouse_id", null);
    if (error) throw new Error(`applyAbcConfig.results: ${error.message}`);
  }

  return { affected: sim.changes.length };
}

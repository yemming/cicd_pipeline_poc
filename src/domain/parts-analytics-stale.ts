/**
 * Domain Helper — Parts Analytics Stale（呆滯庫存 A 級加強版）
 *
 * 功能：
 *   - listStaleInventory(brandId, filters) — 含 warehouse breakdown
 *   - getStaleInventoryStats — KpiCard 用 4 顆 tile 純數值
 *   - getStaleByAgeBucket — BarChart：6 段庫齡分佈
 *   - getStaleByWarehouseAge — HeatMap：rows=warehouse, cols=age_bucket, cell=count
 *
 * 設計：reuse 既有 `src/domain/analytics.ts` 的 `listStaleRows`/`getStaleOverview`
 * 業務邏輯（閒置 ≥ 90 才算 stale、原因 heuristic、suggested_action），
 * 本檔負責補上「全庫齡光譜（0-30 / 30-60 / ...）+ warehouse 維度」給 A 級視覺化。
 *
 * 對應頁面：/parts/analytics/stale
 * Spec：docs/DUCATI_v2_output/04_庫存管理/09_分析報表/12_分析報表_呆滯庫存.html
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  listStaleRows as listStaleRowsBase,
  getStaleOverview as getStaleOverviewBase,
} from "./analytics";

import {
  type AgeBucketBar,
  type AgeBucketKey,
  type StaleFilter,
  type StaleKpiStats,
  type StaleOverview,
  type StaleRow,
  type WarehouseAgeHeatCell,
  AGE_BUCKET_META,
  STALE_AGE_BUCKETS,
  ageBucketOf,
} from "./parts-analytics-stale.constants";

// ---------------------------------------------------------------------------
// internal: 抓所有 stock_items（含 fresh 的）跑 6-bucket 全光譜聚合
// listStaleRowsBase 只回 ≥90 的；BarChart / HeatMap 需要 0-90 段也呈現
// ---------------------------------------------------------------------------

type StockSnapshot = {
  item_id: string;
  warehouse_id: string;
  warehouse_name: string;
  qty: number;
  value: number;
  last_movement_at: string | null;
};

async function getAllStockSnapshots(): Promise<StockSnapshot[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [stockRes, whRes] = await Promise.all([
    supabase
      .from("stock_items")
      .select("item_id, warehouse_id, qty, unit_cost, last_movement_at")
      .eq("brand_id", brand)
      .gt("qty", 0),
    supabase
      .from("warehouses")
      .select("id, name")
      .eq("brand_id", brand),
  ]);
  if (stockRes.error) throw new Error(`getAllStockSnapshots.stock: ${stockRes.error.message}`);
  if (whRes.error) throw new Error(`getAllStockSnapshots.warehouses: ${whRes.error.message}`);

  const whNameMap = new Map<string, string>();
  for (const w of whRes.data ?? []) whNameMap.set(w.id, w.name);

  return (stockRes.data ?? []).map((s) => ({
    item_id: s.item_id,
    warehouse_id: s.warehouse_id,
    warehouse_name: whNameMap.get(s.warehouse_id) ?? "—",
    qty: Number(s.qty ?? 0),
    value: Number(s.qty ?? 0) * Number(s.unit_cost ?? 0),
    last_movement_at: s.last_movement_at ?? null,
  }));
}

// ---------------------------------------------------------------------------
// listStaleInventory — 在 base rows 上補 warehouse_name 主倉
// ---------------------------------------------------------------------------

export async function listStaleInventory(filter: StaleFilter = {}): Promise<StaleRow[]> {
  // base helper 已含 abc/reason/bucket/q filter
  const base = await listStaleRowsBase({
    bucket: filter.bucket,
    abc: filter.abc,
    reason: filter.reason,
    q: filter.q,
  });
  if (base.length === 0) return [];

  // 補 warehouse_name：每個 item 取庫存量最大的倉作為「主要倉庫」
  const snaps = await getAllStockSnapshots();
  const dominantWh = new Map<string, { wh_id: string; wh_name: string; qty: number }>();
  for (const s of snaps) {
    const cur = dominantWh.get(s.item_id);
    if (!cur || s.qty > cur.qty) {
      dominantWh.set(s.item_id, { wh_id: s.warehouse_id, wh_name: s.warehouse_name, qty: s.qty });
    }
  }

  let rows: StaleRow[] = base.map((r) => ({
    ...r,
    warehouse_name: dominantWh.get(r.item_id)?.wh_name ?? null,
  }));

  // warehouse_id filter（base helper 沒有這個維度，這裡補）
  if (filter.warehouse_id && filter.warehouse_id !== "all") {
    rows = rows.filter(
      (r) => dominantWh.get(r.item_id)?.wh_id === filter.warehouse_id,
    );
  }

  return rows;
}

// ---------------------------------------------------------------------------
// 同時拿 overview + warehouse-augmented rows（一次 round-trip）
// ---------------------------------------------------------------------------

export async function getStaleAnalyticsPageData(): Promise<{
  overview: StaleOverview;
  rows: StaleRow[];
}> {
  const [{ overview }, rows] = await Promise.all([
    getStaleOverviewBase(),
    listStaleInventory({}),
  ]);
  return { overview, rows };
}

// ---------------------------------------------------------------------------
// KpiCard stats — 呆滯 SKU 數 / 總積壓金額 / 最老 SKU 天數 / 平均庫齡 + delta
// ---------------------------------------------------------------------------

export async function getStaleInventoryStats(): Promise<StaleKpiStats> {
  const rows = await listStaleRowsBase();

  if (rows.length === 0) {
    return {
      stale_sku_count: 0,
      total_stale_value: 0,
      oldest_days: 0,
      avg_idle_days: 0,
      stale_sku_delta_pct: null,
    };
  }

  let totalValue = 0;
  let oldest = 0;
  let sumDays = 0;
  // 30 天前估算（days_idle - 30 仍 ≥ 90 的件數，即 30 天前已經呆滯）
  let count30dAgo = 0;
  for (const r of rows) {
    totalValue += r.value;
    if (r.days_idle > oldest) oldest = r.days_idle;
    sumDays += r.days_idle;
    if (r.days_idle - 30 >= 90) count30dAgo += 1;
  }

  const avg = Math.round(sumDays / rows.length);
  const delta =
    count30dAgo > 0
      ? Math.round(((rows.length - count30dAgo) / count30dAgo) * 100)
      : null;

  return {
    stale_sku_count: rows.length,
    total_stale_value: Math.round(totalValue),
    oldest_days: oldest,
    avg_idle_days: avg,
    stale_sku_delta_pct: delta,
  };
}

// ---------------------------------------------------------------------------
// BarChart：6 段庫齡分佈（含 fresh + stale 全光譜）
// ---------------------------------------------------------------------------

export async function getStaleByAgeBucket(): Promise<AgeBucketBar[]> {
  const snaps = await getAllStockSnapshots();
  const nowMs = Date.now();

  // per-item 聚合：qty / value / 最近 last_movement_at（取 max）
  const itemAgg = new Map<
    string,
    { qty: number; value: number; lastMove: string | null }
  >();
  for (const s of snaps) {
    const cur = itemAgg.get(s.item_id) ?? { qty: 0, value: 0, lastMove: null };
    cur.qty += s.qty;
    cur.value += s.value;
    if (s.last_movement_at && (!cur.lastMove || s.last_movement_at > cur.lastMove)) {
      cur.lastMove = s.last_movement_at;
    }
    itemAgg.set(s.item_id, cur);
  }

  const buckets: Record<AgeBucketKey, { count: number; value: number }> = {
    d0_30: { count: 0, value: 0 },
    d30_60: { count: 0, value: 0 },
    d60_90: { count: 0, value: 0 },
    d90_180: { count: 0, value: 0 },
    d180_365: { count: 0, value: 0 },
    d365_plus: { count: 0, value: 0 },
  };

  for (const agg of itemAgg.values()) {
    if (agg.qty <= 0) continue;
    const days = agg.lastMove
      ? Math.floor((nowMs - new Date(agg.lastMove).getTime()) / 86_400_000)
      : 999;
    const b = ageBucketOf(days);
    buckets[b].count += 1;
    buckets[b].value += agg.value;
  }

  return STALE_AGE_BUCKETS.map((b) => ({
    bucket: b,
    label: AGE_BUCKET_META[b].shortLabel,
    count: buckets[b].count,
    value: Math.round(buckets[b].value),
  }));
}

// ---------------------------------------------------------------------------
// HeatMap：倉庫 × 庫齡 — cell = count（呆滯料件數）
// 只看 ≥90 天的庫齡段（4 段），避免熱點全集中在 fresh
// ---------------------------------------------------------------------------

export async function getStaleByWarehouseAge(): Promise<WarehouseAgeHeatCell[]> {
  const snaps = await getAllStockSnapshots();
  const nowMs = Date.now();

  // per-(warehouse, item) 聚合 last_movement_at；以倉為單位算庫齡（同 item 不同倉可以是不同 bucket）
  type Key = string; // wh_id|item_id
  const perWhItem = new Map<
    Key,
    { wh_id: string; wh_name: string; lastMove: string | null }
  >();
  for (const s of snaps) {
    const key: Key = `${s.warehouse_id}|${s.item_id}`;
    const cur =
      perWhItem.get(key) ?? {
        wh_id: s.warehouse_id,
        wh_name: s.warehouse_name,
        lastMove: null,
      };
    if (s.last_movement_at && (!cur.lastMove || s.last_movement_at > cur.lastMove)) {
      cur.lastMove = s.last_movement_at;
    }
    perWhItem.set(key, cur);
  }

  // 倉 × bucket → count
  const cellMap = new Map<string, WarehouseAgeHeatCell>();
  for (const v of perWhItem.values()) {
    const days = v.lastMove
      ? Math.floor((nowMs - new Date(v.lastMove).getTime()) / 86_400_000)
      : 999;
    if (days < 90) continue; // 只看呆滯段
    const bucket = ageBucketOf(days);
    const k = `${v.wh_id}|${bucket}`;
    const existing = cellMap.get(k);
    if (existing) {
      existing.count += 1;
    } else {
      cellMap.set(k, {
        warehouse_id: v.wh_id,
        warehouse_name: v.wh_name,
        bucket,
        count: 1,
      });
    }
  }

  // 補 0 值（為了 heatmap row × col 對齊；至少每倉都列出 4 個 stale bucket）
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const whRes = await supabase
    .from("warehouses")
    .select("id, name")
    .eq("brand_id", brand)
    .eq("is_active", true);
  if (whRes.error) throw new Error(`getStaleByWarehouseAge.wh: ${whRes.error.message}`);

  const staleOnly: AgeBucketKey[] = ["d90_180", "d180_365", "d365_plus"];
  const cells: WarehouseAgeHeatCell[] = [];
  for (const w of whRes.data ?? []) {
    for (const b of staleOnly) {
      const k = `${w.id}|${b}`;
      cells.push(
        cellMap.get(k) ?? {
          warehouse_id: w.id,
          warehouse_name: w.name,
          bucket: b,
          count: 0,
        },
      );
    }
  }

  return cells;
}

// ---------------------------------------------------------------------------
// Lookup: 取當前 brand 的倉庫清單（filter 用）
// ---------------------------------------------------------------------------

export async function listWarehouseLookup(): Promise<Array<{ id: string; name: string }>> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const res = await supabase
    .from("warehouses")
    .select("id, name")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .order("name");
  if (res.error) throw new Error(`listWarehouseLookup: ${res.error.message}`);
  return res.data ?? [];
}

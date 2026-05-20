"use server";

/**
 * Domain Helper — Parts Balance（商品庫存查詢 v2，§7.1）
 *
 * v2 規格（M04L-3 / 04_庫存管理/05_庫存作業/07_商品庫存查詢_v2.html）：
 * - 整合 v_stock_balances（已含 abc_class / qty_total / qty_available）
 * - join stock_thresholds 算出 alert_level
 * - SparkLine 用 stock_movements 7 日 in/out
 * - 一鍵補貨走 replenishment.runReplenishment（既有 RPC）
 *
 * ⚠️ 跟舊 src/domain/stock.ts 不衝突 — 那邊還是給 list 舊 view + 序列號查詢用，
 *    本 helper 走新 v2 視圖（依靠 v_stock_balances，是 stock_items 的 server-side aggregate）。
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

export type AlertLevel =
  | "none"
  | "out_of_stock"
  | "below_safety"
  | "below_reorder"
  | "over_max"
  | "stale";

export type AbcClass = "A" | "B" | "C" | "D" | null;

export type BalanceRow = {
  item_id: string;
  item_code: string;
  item_name: string;
  item_category: string | null;
  abc_class: AbcClass;
  uom: string | null;
  warehouse_id: string | null;
  warehouse_code: string | null;
  warehouse_name: string | null;
  qty_available: number;
  qty_reserved: number;
  qty_total: number;
  qty_in_transit: number;
  avg_unit_cost: number;
  last_movement_at: string | null;
  // threshold 拼接
  safety_stock: number | null;
  reorder_point: number | null;
  max_stock: number | null;
  alert_priority: string | null;
  alert_level: AlertLevel;
};

export type BalanceFilter = {
  q?: string;
  warehouse_id?: string;
  abc_class?: string;
  alert_level?: string;
  category?: string;
  include_zero?: boolean;
};

export type BalanceStats = {
  total_skus: number;
  below_safety: number;
  over_max: number;
  out_of_stock: number;
  alerting: number; // below_safety + below_reorder + over_max + out_of_stock + stale
  total_value: number; // sum(qty_total * avg_unit_cost)
};

function deriveAlertLevel(row: {
  qty_total: number;
  qty_available: number;
  safety_stock: number | null;
  reorder_point: number | null;
  max_stock: number | null;
  last_movement_at: string | null;
}): AlertLevel {
  if (row.qty_total <= 0) return "out_of_stock";
  if (row.safety_stock != null && row.qty_available < Number(row.safety_stock)) return "below_safety";
  if (row.reorder_point != null && row.qty_available < Number(row.reorder_point)) return "below_reorder";
  if (row.max_stock != null && row.qty_total > Number(row.max_stock)) return "over_max";
  // stale：90 天無異動
  if (row.last_movement_at) {
    const days = (Date.now() - new Date(row.last_movement_at).getTime()) / 86400_000;
    if (days > 90) return "stale";
  }
  return "none";
}

/**
 * List + KpiStats 一次抓齊（page-server 端用）。
 * 因為 KPI 需要 brand 全集統計、不只當頁，所以 fetch 全集 join threshold + 在 JS 內過濾分頁。
 */
export async function getInventoryBalanceWithAlerts(
  filter: BalanceFilter = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{
  rows: BalanceRow[];
  totalCount: number;
  stats: BalanceStats;
}> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  // 1) 撈 v_stock_balances 全集
  let q = supabase
    .from("v_stock_balances")
    .select(
      "item_id, item_code, item_name, item_category, abc_class, uom, warehouse_id, warehouse_code, warehouse_name, qty_available, qty_reserved, qty_total, qty_in_transit, avg_unit_cost, last_movement_at",
    )
    .eq("brand_id", scope.brand_id)
    .limit(10_000);
  if (filter.warehouse_id) q = q.eq("warehouse_id", filter.warehouse_id);
  const { data: balances, error } = await q;
  if (error) throw error;
  const list = balances ?? [];

  // 2) 撈 stock_thresholds（同 brand 全集，join (item_id, warehouse_id)）
  const { data: thresholds, error: tErr } = await supabase
    .from("stock_thresholds")
    .select("item_id, warehouse_id, safety_stock, reorder_point, max_stock, alert_priority")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true);
  if (tErr) throw tErr;
  const tMap = new Map<string, (typeof thresholds)[number]>();
  for (const t of thresholds ?? []) {
    tMap.set(`${t.item_id}::${t.warehouse_id ?? ""}`, t);
  }

  // 3) 組 row + alert_level
  let rows: BalanceRow[] = list.map((b) => {
    const t = tMap.get(`${b.item_id}::${b.warehouse_id ?? ""}`);
    const safety_stock = t?.safety_stock != null ? Number(t.safety_stock) : null;
    const reorder_point = t?.reorder_point != null ? Number(t.reorder_point) : null;
    const max_stock = t?.max_stock != null ? Number(t.max_stock) : null;
    const qty_total = Number(b.qty_total ?? 0);
    const qty_available = Number(b.qty_available ?? 0);
    const alert_level = deriveAlertLevel({
      qty_total,
      qty_available,
      safety_stock,
      reorder_point,
      max_stock,
      last_movement_at: b.last_movement_at,
    });
    return {
      item_id: b.item_id ?? "",
      item_code: b.item_code ?? "",
      item_name: b.item_name ?? "",
      item_category: b.item_category ?? null,
      abc_class: (b.abc_class as AbcClass) ?? null,
      uom: b.uom ?? null,
      warehouse_id: b.warehouse_id ?? null,
      warehouse_code: b.warehouse_code ?? null,
      warehouse_name: b.warehouse_name ?? null,
      qty_available,
      qty_reserved: Number(b.qty_reserved ?? 0),
      qty_total,
      qty_in_transit: Number(b.qty_in_transit ?? 0),
      avg_unit_cost: Number(b.avg_unit_cost ?? 0),
      last_movement_at: b.last_movement_at,
      safety_stock,
      reorder_point,
      max_stock,
      alert_priority: t?.alert_priority ?? null,
      alert_level,
    };
  });

  // 4) 算全集 stats（在 filter 之前算 — KPI 是 brand 全集視角）
  const stats: BalanceStats = {
    total_skus: new Set(rows.map((r) => r.item_id)).size,
    below_safety: rows.filter((r) => r.alert_level === "below_safety").length,
    over_max: rows.filter((r) => r.alert_level === "over_max").length,
    out_of_stock: rows.filter((r) => r.alert_level === "out_of_stock").length,
    alerting: rows.filter((r) => r.alert_level !== "none").length,
    total_value: rows.reduce((s, r) => s + r.qty_total * r.avg_unit_cost, 0),
  };

  // 5) 套 filter
  if (!filter.include_zero) {
    rows = rows.filter((r) => r.qty_total > 0);
  }
  if (filter.abc_class) {
    rows = rows.filter((r) => r.abc_class === filter.abc_class);
  }
  if (filter.alert_level) {
    rows = rows.filter((r) => r.alert_level === filter.alert_level);
  }
  if (filter.category) {
    const cl = filter.category.toLowerCase();
    rows = rows.filter((r) => (r.item_category ?? "").toLowerCase() === cl);
  }
  if (filter.q) {
    const ql = filter.q.toLowerCase();
    rows = rows.filter(
      (r) => r.item_code.toLowerCase().includes(ql) || r.item_name.toLowerCase().includes(ql),
    );
  }

  rows.sort((a, b) => {
    // 告警優先排上面，其次 item_code
    const aw = a.alert_level === "none" ? 99 : 0;
    const bw = b.alert_level === "none" ? 99 : 0;
    if (aw !== bw) return aw - bw;
    return a.item_code.localeCompare(b.item_code);
  });

  const totalCount = rows.length;
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? 50);
  const from = (page - 1) * pageSize;
  const paged = rows.slice(from, from + pageSize);

  return { rows: paged, totalCount, stats };
}

/**
 * Detail Panel 用：撈某 item 最近 7 日 in/out 異動聚合，給 SparkLine。
 */
export async function getItem7DayMovement(
  itemId: string,
): Promise<{ in_series: number[]; out_series: number[]; net_series: number[]; labels: string[] }> {
  await requirePermission(PERMISSIONS.RECEIPT_VIEW);
  const supabase = await createClient();
  const scope = await getActiveScope();

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 6);

  const { data, error } = await supabase
    .from("stock_movements")
    .select("direction, qty, created_at")
    .eq("brand_id", scope.brand_id)
    .eq("item_id", itemId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });
  if (error) throw error;

  // 7 個 bucket（0 = 6 天前、6 = 今天）
  const in_series = new Array(7).fill(0) as number[];
  const out_series = new Array(7).fill(0) as number[];
  const labels: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }

  for (const m of data ?? []) {
    if (!m.created_at) continue;
    const t = new Date(m.created_at);
    t.setHours(0, 0, 0, 0);
    const bucket = Math.floor((t.getTime() - since.getTime()) / 86400_000);
    if (bucket < 0 || bucket > 6) continue;
    const q = Number(m.qty ?? 0);
    if (m.direction === "in") in_series[bucket] += q;
    else if (m.direction === "out") out_series[bucket] += q;
  }

  const net_series = in_series.map((v, i) => v - out_series[i]);
  return { in_series, out_series, net_series, labels };
}

/**
 * 給 page-server 一次撈：rows + stats + warehouses + canEdit。
 */
export async function getBalancePageData(
  filter: BalanceFilter = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{
  rows: BalanceRow[];
  totalCount: number;
  stats: BalanceStats;
  warehouses: Array<{ id: string; code: string | null; name: string }>;
  categories: string[];
  canReplenish: boolean;
}> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const [agg, canReplenish, whRes, catRes] = await Promise.all([
    getInventoryBalanceWithAlerts(filter, options),
    hasPermission(PERMISSIONS.REPLENISHMENT_RUN),
    supabase
      .from("warehouses")
      .select("id, code, name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabase
      .from("items")
      .select("category")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .not("category", "is", null),
  ]);
  if (whRes.error) throw whRes.error;
  if (catRes.error) throw catRes.error;

  const categories = Array.from(
    new Set((catRes.data ?? []).map((r) => r.category).filter((x): x is string => !!x)),
  ).sort();

  return {
    rows: agg.rows,
    totalCount: agg.totalCount,
    stats: agg.stats,
    warehouses: (whRes.data ?? []).map((w) => ({ id: w.id, code: w.code, name: w.name ?? "" })),
    categories,
    canReplenish,
  };
}

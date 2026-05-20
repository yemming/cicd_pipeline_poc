"use server";

/**
 * Domain Helper — Stock Thresholds（庫存水位設定 A 級補件）
 *
 * 補在 `src/domain/alerts.ts` 之上的高層次查詢：
 *  - getThresholdStats：KPI（已設定 / 缺料中 / 超儲備 / 接近再訂購點）
 *  - getStockTrend：給右側 Panel 的 LineChart 用，回 90 天 closing stock
 *    + 該 SKU 的 safety / reorder / max 水平線
 *
 * 不動 `src/domain/parts-balance.ts`（M04L-3 sub-agent 維護中）。
 * 不動 `src/domain/alerts.ts`（threshold CRUD 已在那邊）。
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

export type ThresholdStats = {
  configured: number; // 啟用中的 threshold row 數
  below_safety: number; // qty_available < safety_stock
  over_max: number; // qty_total > max_stock
  near_reorder: number; // qty_available <= reorder_point * 1.1（接近再訂購點、預警）
};

export async function getThresholdStats(): Promise<ThresholdStats> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  // 1) 啟用 threshold rows
  const { data: thresholds, error: tErr } = await supabase
    .from("stock_thresholds")
    .select("item_id, warehouse_id, safety_stock, reorder_point, max_stock")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true);
  if (tErr) throw tErr;
  const ts = thresholds ?? [];
  const configured = ts.length;

  if (configured === 0) {
    return { configured: 0, below_safety: 0, over_max: 0, near_reorder: 0 };
  }

  // 2) 撈對應 v_stock_balances（同 brand 全集）— join 在 JS
  const { data: balances, error: bErr } = await supabase
    .from("v_stock_balances")
    .select("item_id, warehouse_id, qty_available, qty_total")
    .eq("brand_id", scope.brand_id);
  if (bErr) throw bErr;

  const bMap = new Map<string, { qty_available: number; qty_total: number }>();
  for (const b of balances ?? []) {
    bMap.set(`${b.item_id}::${b.warehouse_id ?? ""}`, {
      qty_available: Number(b.qty_available ?? 0),
      qty_total: Number(b.qty_total ?? 0),
    });
  }

  let below_safety = 0;
  let over_max = 0;
  let near_reorder = 0;

  for (const t of ts) {
    const b = bMap.get(`${t.item_id}::${t.warehouse_id ?? ""}`);
    if (!b) continue;
    const safety = t.safety_stock != null ? Number(t.safety_stock) : null;
    const reorder = t.reorder_point != null ? Number(t.reorder_point) : null;
    const max = t.max_stock != null ? Number(t.max_stock) : null;
    if (safety != null && b.qty_available < safety) below_safety++;
    if (max != null && b.qty_total > max) over_max++;
    if (
      reorder != null &&
      b.qty_available > (safety ?? 0) &&
      b.qty_available <= reorder * 1.1
    ) {
      near_reorder++;
    }
  }

  return { configured, below_safety, over_max, near_reorder };
}

// ─────────────────────────────────────────────────────────────────────────────
// 90-day stock trend（右側 Panel 用）
// ─────────────────────────────────────────────────────────────────────────────

export type TrendDay = {
  day: string; // YYYY-MM-DD
  label: string; // M/D
  closing: number; // 當日結束時的 qty_total
  safety: number | null;
  reorder: number | null;
  max: number | null;
};

export type StockTrend = {
  days: TrendDay[];
  current: number; // 今日 closing
  threshold: {
    safety: number | null;
    reorder: number | null;
    max: number | null;
  };
};

/**
 * 90 天庫存曲線（給 LineChart）。
 *
 * 演算法：
 *  1) 取目前 v_stock_balances 的 qty_total = today closing
 *  2) 撈 90 天內 stock_movements，每日聚合 net = sum(in) - sum(out)
 *  3) 由今日往回推：yesterday_closing = today_closing - today_net
 *     （demo seed 資料量稀疏的日子 net=0，曲線會平）
 *  4) 對每天附上 safety / reorder / max 三條水平線（從 thresholds 抓）
 *
 * ⚠️ POC 階段：歷史曲線是 demo 用的視覺化，不是精算財報資料；
 *    真實情境會走 daily snapshot table，本實作不做。
 */
export async function getStockTrend(
  itemId: string,
  warehouseId: string,
  days: number = 90,
): Promise<StockTrend | null> {
  if (!itemId || !warehouseId) return null;
  if (!(await hasPermission(PERMISSIONS.ALERT_VIEW))) return null;

  const supabase = await createClient();
  const scope = await getActiveScope();

  // 1) 拿 threshold 三條線
  const { data: t, error: tErr } = await supabase
    .from("stock_thresholds")
    .select("safety_stock, reorder_point, max_stock")
    .eq("brand_id", scope.brand_id)
    .eq("item_id", itemId)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();
  if (tErr) throw tErr;

  const safety = t?.safety_stock != null ? Number(t.safety_stock) : null;
  const reorder = t?.reorder_point != null ? Number(t.reorder_point) : null;
  const max = t?.max_stock != null ? Number(t.max_stock) : null;

  // 2) 拿目前庫存當 today closing
  const { data: bal, error: bErr } = await supabase
    .from("v_stock_balances")
    .select("qty_total")
    .eq("brand_id", scope.brand_id)
    .eq("item_id", itemId)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();
  if (bErr) throw bErr;
  const currentClosing = Number(bal?.qty_total ?? 0);

  // 3) 撈 N 天內 movements、每日 net
  const sinceDate = new Date();
  sinceDate.setHours(0, 0, 0, 0);
  sinceDate.setDate(sinceDate.getDate() - (days - 1));

  const { data: mvs, error: mErr } = await supabase
    .from("stock_movements")
    .select("direction, qty, created_at")
    .eq("brand_id", scope.brand_id)
    .eq("item_id", itemId)
    .eq("warehouse_id", warehouseId)
    .gte("created_at", sinceDate.toISOString())
    .order("created_at", { ascending: true });
  if (mErr) throw mErr;

  // bucket index 0 = days-1 天前, days-1 = 今天
  const netByDay = new Array(days).fill(0) as number[];
  for (const m of mvs ?? []) {
    if (!m.created_at) continue;
    const d = new Date(m.created_at);
    d.setHours(0, 0, 0, 0);
    const idx = Math.floor((d.getTime() - sinceDate.getTime()) / 86_400_000);
    if (idx < 0 || idx >= days) continue;
    const q = Number(m.qty ?? 0);
    if (m.direction === "in") netByDay[idx] += q;
    else if (m.direction === "out") netByDay[idx] -= q;
  }

  // 4) 從今天往回推 closing
  const closings = new Array(days).fill(0) as number[];
  closings[days - 1] = currentClosing;
  for (let i = days - 2; i >= 0; i--) {
    // closing[i] = closing[i+1] - net[i+1]
    closings[i] = closings[i + 1] - netByDay[i + 1];
  }

  const out: TrendDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(sinceDate);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    out.push({
      day: iso,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      closing: Math.max(0, Math.round(closings[i])),
      safety,
      reorder,
      max,
    });
  }

  return {
    days: out,
    current: currentClosing,
    threshold: { safety, reorder, max },
  };
}

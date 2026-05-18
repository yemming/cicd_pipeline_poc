/**
 * RS_M1 銷售漏斗看板（主管工作台）helper — server-only。
 *
 * 對應 nav_node `3b732995-c5a8-46d7-8e2b-730d7c7a8933`（Indian / 主管工作台 / 銷售漏斗）。
 *
 * Round-9 Batch B（2026-05-18）：
 * - 接 supabase: 從 `sales_funnel_metrics` view 取 6 階段數據、從 `kpi_targets` 表取目標值
 * - 保留 _FALLBACK 路徑：任何 query 失敗（network / RLS / view 異常）回 constants，避免空畫面
 * - Period 切換由 page-level option 控制；預設 month + 當月
 * - Board 仍 import 4 個 RsKey('lin'/'zhang'/'wang'/'chen')，本 helper 把 DB 上 contacts top-4 RS
 *   塞進去；不足 4 個就補 fallback；零 RS 全走 fallback
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  RS_LIST_FALLBACK,
  KPI_TARGETS_FALLBACK,
  CUSTOMER_TAG_GROUPS_FALLBACK,
  FUNNEL_STAGES_FALLBACK,
  LAST_UPDATED_FALLBACK,
  type RsMetrics,
  type RsKey,
  type Period,
} from "./sales-manager-funnel.constants";

type FunnelRow = {
  brand_id: string;
  period_type: string;
  period_key: string;
  rs_name: string;
  contacts: number;
  builds: number;
  trials: number;
  quotes: number;
  orders: number;
  deliveries: number;
};

type KpiTargetRow = {
  metric_code: string;
  target_value: number | string;
};

export interface SalesManagerFunnelOptions {
  /** 期間粒度，預設 month */
  period?: Period;
  /** 期間 key，預設依當下時間算（month=YYYY-MM / quarter=YYYY-Qn / year=YYYY） */
  periodKey?: string;
}

function currentPeriodKey(period: Period, d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (period === "year") return String(y);
  if (period === "quarter") return `${y}-Q${Math.ceil(m / 3)}`;
  return `${y}-${String(m).padStart(2, "0")}`;
}

// 把目標 row[] 攤平成 board 要的物件 shape；缺哪 key 就走 fallback 的對應值
function mapKpiTargets(rows: KpiTargetRow[]): typeof KPI_TARGETS_FALLBACK {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.metric_code, Number(r.target_value));
  return {
    build:      m.get("build")      ?? KPI_TARGETS_FALLBACK.build,
    trial:      m.get("trial")      ?? KPI_TARGETS_FALLBACK.trial,
    quote:      m.get("quote")      ?? KPI_TARGETS_FALLBACK.quote,
    order:      m.get("order")      ?? KPI_TARGETS_FALLBACK.order,
    deliveries: m.get("deliveries") ?? KPI_TARGETS_FALLBACK.deliveries,
    ordersAbs:  m.get("orders_abs") ?? KPI_TARGETS_FALLBACK.ordersAbs,
    closeRate:  m.get("close_rate") ?? KPI_TARGETS_FALLBACK.closeRate,
  };
}

const RS_KEYS: RsKey[] = ["lin", "zhang", "wang", "chen"];

// 把 DB 上 contacts top-4 RS 塞進 board 的 4 個 slot；其餘 row 與 __all__ 排除
function mapRsList(rows: FunnelRow[]): RsMetrics[] {
  const realRs = rows.filter((r) => r.rs_name !== "__all__" && r.rs_name !== "(未指派)");
  // 排序：先用 contacts，全 0 時用 builds + trials + orders + deliveries 加總
  const scored = realRs
    .map((r) => ({
      row: r,
      score: r.contacts || r.builds + r.trials + r.quotes + r.orders + r.deliveries,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (scored.length === 0) return RS_LIST_FALLBACK;

  return scored.map((s, i) => {
    const r = s.row;
    const fb = RS_LIST_FALLBACK[i] ?? RS_LIST_FALLBACK[0];
    return {
      key: RS_KEYS[i],
      name: r.rs_name,
      contacts: r.contacts,
      builds: r.builds,
      trials: r.trials,
      quotes: r.quotes,
      orders: r.orders,
      deliveries: r.deliveries,
      // HABC 分佈先用 fallback bucket；後續從 sales_leads.habc / 客戶 tag 補真實資料
      habc: fb.habc,
    };
  });
}

export async function getSalesManagerFunnelData(options: SalesManagerFunnelOptions = {}) {
  const period: Period = options.period ?? "month";
  const periodKey = options.periodKey ?? currentPeriodKey(period);

  // Fallback shape：以 constants 為基礎，遇到 DB OK 就覆寫
  let rsList = RS_LIST_FALLBACK;
  let kpiTargets = KPI_TARGETS_FALLBACK;
  let lastUpdated = LAST_UPDATED_FALLBACK;
  let usingFallback = false;

  try {
    const supabase = await createClient();
    const { brand_id } = await getActiveScope();

    const [funnelRes, targetRes] = await Promise.all([
      supabase
        .from("sales_funnel_metrics")
        .select("brand_id, period_type, period_key, rs_name, contacts, builds, trials, quotes, orders, deliveries")
        .eq("brand_id", brand_id)
        .eq("period_type", period)
        .eq("period_key", periodKey),
      supabase
        .from("kpi_targets")
        .select("metric_code, target_value")
        .eq("brand_id", brand_id)
        .eq("subject_type", "global")
        .is("subject_id", null)
        .eq("period_type", period)
        .eq("period_key", periodKey),
    ]);

    if (funnelRes.error) throw funnelRes.error;
    if (targetRes.error) throw targetRes.error;

    const funnelRows = (funnelRes.data ?? []) as FunnelRow[];
    const targetRows = (targetRes.data ?? []) as KpiTargetRow[];

    if (funnelRows.length > 0) {
      rsList = mapRsList(funnelRows);
    }
    if (targetRows.length > 0) {
      kpiTargets = mapKpiTargets(targetRows);
    }
    if (funnelRows.length === 0 && targetRows.length === 0) {
      // 兩邊都空 → 視為 fallback 路徑
      usingFallback = true;
    } else {
      lastUpdated = new Date().toISOString().slice(0, 16).replace("T", " ");
    }
  } catch (err) {
    console.error("[sales-manager-funnel] DB query failed, using fallback:", err);
    usingFallback = true;
  }

  return {
    rsList,
    kpiTargets,
    // 標籤群組 / funnel 階段是純 UI 配置，不接 DB
    tagGroups: CUSTOMER_TAG_GROUPS_FALLBACK,
    funnelStages: FUNNEL_STAGES_FALLBACK,
    lastUpdated,
    period,
    periodKey,
    isFallback: usingFallback,
  };
}

export type SalesManagerFunnelData = Awaited<ReturnType<typeof getSalesManagerFunnelData>>;

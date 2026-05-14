/**
 * Domain helper — NPS 看板（/sales/crm/nps-dashboard、/aftersales/crm/nps-dashboard）
 *
 * 純讀：彙總 nps_responses（依 kind = 'sales' | 'aftersales'）的分數 → KPI / 趨勢 / 分組 / 留言。
 * 無寫入動作（POC 階段先讀，分數寫入會由電訪工作檯之類的單獨流程觸發）。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  classifyScore,
  RANGE_DAYS,
  type NpsCategory,
  type RangeKey,
} from "@/domain/sales-nps.constants";

export type NpsResponseRow = {
  id: string;
  score: number;
  category: NpsCategory;
  comment: string | null;
  store_id: string | null;
  store_name: string | null;
  sales_person: string | null;
  customer_id: string | null;
  customer_name: string | null;
  responded_at: string;
};

export type NpsKpi = {
  total: number;
  promoter: number;
  passive: number;
  detractor: number;
  promoterPct: number;
  passivePct: number;
  detractorPct: number;
  npsScore: number; // promoterPct - detractorPct, rounded
  avgScore: number; // 平均分（0-10）
};

export type NpsTrendPoint = {
  /** YYYY-MM-DD（週的話 = 該週週一日期） */
  bucket: string;
  total: number;
  promoter: number;
  passive: number;
  detractor: number;
  npsScore: number;
};

export type NpsGroupRow = {
  key: string;
  label: string;
  total: number;
  promoter: number;
  passive: number;
  detractor: number;
  npsScore: number;
  avgScore: number;
};

export type SalesNpsDashboard = {
  kpi: NpsKpi;
  trend: NpsTrendPoint[];
  byStore: NpsGroupRow[];
  bySalesPerson: NpsGroupRow[];
  recentDetractors: NpsResponseRow[];
};

export type NpsKind = "sales" | "aftersales";

export type NpsFilters = {
  range: RangeKey;
  kind?: NpsKind;
};

type RawRow = {
  id: string;
  score: number;
  category: string;
  comment: string | null;
  store_id: string | null;
  sales_person: string | null;
  customer_id: string | null;
  responded_at: string;
};

function pct(n: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((n * 1000) / total) / 10;
}

function emptyKpi(): NpsKpi {
  return {
    total: 0,
    promoter: 0,
    passive: 0,
    detractor: 0,
    promoterPct: 0,
    passivePct: 0,
    detractorPct: 0,
    npsScore: 0,
    avgScore: 0,
  };
}

function buildKpi(rows: RawRow[]): NpsKpi {
  if (rows.length === 0) return emptyKpi();
  let promoter = 0,
    passive = 0,
    detractor = 0,
    sum = 0;
  for (const r of rows) {
    const c = classifyScore(r.score);
    if (c === "promoter") promoter++;
    else if (c === "passive") passive++;
    else detractor++;
    sum += r.score;
  }
  const total = rows.length;
  const promoterPct = pct(promoter, total);
  const passivePct = pct(passive, total);
  const detractorPct = pct(detractor, total);
  return {
    total,
    promoter,
    passive,
    detractor,
    promoterPct,
    passivePct,
    detractorPct,
    npsScore: Math.round(promoterPct - detractorPct),
    avgScore: Math.round((sum * 10) / total) / 10,
  };
}

/** 把 responded_at 切成日期 bucket（YYYY-MM-DD），用 Asia/Taipei timezone 拆 */
function toLocalDate(iso: string): string {
  // shift +08:00 → 取 YYYY-MM-DD
  const d = new Date(iso);
  const tz = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return tz.toISOString().slice(0, 10);
}

function buildTrend(rows: RawRow[], rangeDays: number | null): NpsTrendPoint[] {
  // 用「週」聚合（每週的週一日期當 bucket key）。trend 期間最長 90 天 → 13 個 bucket，圖比較好看。
  const map = new Map<
    string,
    { total: number; promoter: number; passive: number; detractor: number }
  >();
  // 先建空 bucket（給 sparseness — 沒資料的週也畫 0）
  const today = new Date();
  const daysToShow = rangeDays ?? 90;
  for (let i = 0; i < daysToShow; i += 7) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const monday = mondayOf(d);
    if (!map.has(monday)) map.set(monday, { total: 0, promoter: 0, passive: 0, detractor: 0 });
  }
  for (const r of rows) {
    const dateStr = toLocalDate(r.responded_at);
    const monday = mondayOf(new Date(dateStr));
    const cur = map.get(monday) ?? { total: 0, promoter: 0, passive: 0, detractor: 0 };
    cur.total++;
    const c = classifyScore(r.score);
    if (c === "promoter") cur.promoter++;
    else if (c === "passive") cur.passive++;
    else cur.detractor++;
    map.set(monday, cur);
  }
  const pts: NpsTrendPoint[] = [];
  const sortedKeys = Array.from(map.keys()).sort();
  for (const k of sortedKeys) {
    const v = map.get(k)!;
    const p = pct(v.promoter, v.total);
    const d = pct(v.detractor, v.total);
    pts.push({
      bucket: k,
      total: v.total,
      promoter: v.promoter,
      passive: v.passive,
      detractor: v.detractor,
      npsScore: v.total > 0 ? Math.round(p - d) : 0,
    });
  }
  return pts;
}

function mondayOf(d: Date): string {
  // 取得該日期所屬週的週一 YYYY-MM-DD（local time, 假設輸入已 normalize）
  const dt = new Date(d.toISOString().slice(0, 10));
  const day = dt.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(dt.getTime() + diff * 24 * 60 * 60 * 1000);
  return mon.toISOString().slice(0, 10);
}

function buildGroupBy(
  rows: RawRow[],
  keyFn: (r: RawRow) => string | null,
  labelMap: Map<string, string>,
): NpsGroupRow[] {
  const map = new Map<
    string,
    { total: number; promoter: number; passive: number; detractor: number; sum: number }
  >();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    const cur = map.get(k) ?? { total: 0, promoter: 0, passive: 0, detractor: 0, sum: 0 };
    cur.total++;
    cur.sum += r.score;
    const c = classifyScore(r.score);
    if (c === "promoter") cur.promoter++;
    else if (c === "passive") cur.passive++;
    else cur.detractor++;
    map.set(k, cur);
  }
  const rowsOut: NpsGroupRow[] = [];
  for (const [k, v] of map) {
    const promoterPct = pct(v.promoter, v.total);
    const detractorPct = pct(v.detractor, v.total);
    rowsOut.push({
      key: k,
      label: labelMap.get(k) ?? k,
      total: v.total,
      promoter: v.promoter,
      passive: v.passive,
      detractor: v.detractor,
      npsScore: Math.round(promoterPct - detractorPct),
      avgScore: v.total > 0 ? Math.round((v.sum * 10) / v.total) / 10 : 0,
    });
  }
  rowsOut.sort((a, b) => b.total - a.total);
  return rowsOut;
}

export async function getSalesNpsDashboard(
  filters: NpsFilters,
): Promise<SalesNpsDashboard> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const rangeDays = RANGE_DAYS[filters.range];
  const cutoff = rangeDays
    ? new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const kind: NpsKind = filters.kind ?? "sales";

  let q = supabase
    .from("nps_responses")
    .select(
      "id, score, category, comment, store_id, sales_person, customer_id, responded_at",
    )
    .eq("brand_id", brand)
    .eq("kind", kind)
    .order("responded_at", { ascending: false });

  if (cutoff) q = q.gte("responded_at", cutoff);

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as RawRow[];

  // 撈 store / customer 的對應名稱（簡單先撈全部 indian organizations + customers）
  const [{ data: orgs }, { data: custs }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name")
      .eq("brand_id", brand)
      .eq("level", 2),
    supabase
      .from("customers")
      .select("id, name")
      .eq("brand_id", brand),
  ]);
  const storeMap = new Map<string, string>(
    (orgs ?? []).map((o) => [o.id as string, o.name as string]),
  );
  const custMap = new Map<string, string>(
    (custs ?? []).map((c) => [c.id as string, c.name as string]),
  );

  const kpi = buildKpi(rows);
  const trend = buildTrend(rows, rangeDays);
  const byStore = buildGroupBy(rows, (r) => r.store_id, storeMap);
  const bySalesPerson = buildGroupBy(
    rows,
    (r) => r.sales_person,
    new Map(), // label = key 本身
  );

  const recentDetractors: NpsResponseRow[] = rows
    .filter((r) => classifyScore(r.score) === "detractor")
    .slice(0, 8)
    .map((r) => ({
      id: r.id,
      score: r.score,
      category: classifyScore(r.score),
      comment: r.comment,
      store_id: r.store_id,
      store_name: r.store_id ? (storeMap.get(r.store_id) ?? null) : null,
      sales_person: r.sales_person,
      customer_id: r.customer_id,
      customer_name: r.customer_id
        ? (custMap.get(r.customer_id) ?? null)
        : null,
      responded_at: r.responded_at,
    }));

  return { kpi, trend, byStore, bySalesPerson, recentDetractors };
}

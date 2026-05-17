/**
 * Domain helper — NPS 看板（/crm/sales/nps、/crm/aftersales/nps）
 *
 * v2（2026-05-17 CRM05A/B 升級）：
 *   - 期間改為 6m / 12m（移除 7d / 30d / 90d / all）
 *   - 趨勢改為「月度」聚合（不再用週）
 *   - 加 aspect 面向平均 + 本期 vs 上期 delta（依 sales / aftersales 不同 key）
 *   - 加 SA 卡片：每個 SA 的 NPS / 平均 / 筆數 + 「最高」「待改善」two badges
 *
 * 純讀：彙總 nps_responses（依 kind = 'sales' | 'aftersales'）。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  classifyScore,
  RANGE_MONTHS,
  SALES_ASPECT_ORDER,
  AFTERSALES_ASPECT_ORDER,
  SALES_ASPECT_LABEL,
  AFTERSALES_ASPECT_LABEL,
  type NpsCategory,
  type RangeKey,
  type SalesAspectKey,
  type AftersalesAspectKey,
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
  service_type: string | null;
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
  deltaVsPrev: number | null; // 本期 NPS - 上期 NPS（同樣 months 區間）
};

export type NpsTrendPoint = {
  /** YYYY-MM-01 月初日期 */
  bucket: string;
  /** 顯示用月份（e.g. "12月" / "1月"） */
  label: string;
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

/** SA / RS 卡片（aftersales 主要用，sales 也共用） */
export type NpsSaCard = {
  name: string;
  total: number;
  avgScore: number;
  npsScore: number;
  promoterPct: number;
  detractorPct: number;
  /** 'top' = 最高、'attention' = 待改善（最低）、null = 一般 */
  badge: "top" | "attention" | null;
};

/** 面向平均 + delta */
export type NpsAspectRow = {
  key: string;
  label: string;
  avg: number;
  delta: number | null; // 本期 vs 上期；null = 上期無資料
};

export type SalesNpsDashboard = {
  kpi: NpsKpi;
  trend: NpsTrendPoint[];
  byStore: NpsGroupRow[];
  bySalesPerson: NpsGroupRow[];
  saCards: NpsSaCard[];
  aspects: NpsAspectRow[];
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
  category: string | null;
  comment: string | null;
  store_id: string | null;
  sales_person: string | null;
  customer_id: string | null;
  responded_at: string;
  metadata: Record<string, unknown> | null;
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
    deltaVsPrev: null,
  };
}

function buildKpi(rows: RawRow[], deltaVsPrev: number | null = null): NpsKpi {
  if (rows.length === 0) return { ...emptyKpi(), deltaVsPrev };
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
    deltaVsPrev,
  };
}

/** 取得「Asia/Taipei 月初 YYYY-MM-01」 */
function monthStart(iso: string): string {
  const d = new Date(iso);
  const tz = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const y = tz.getUTCFullYear();
  const m = tz.getUTCMonth(); // 0-indexed
  const monthStr = String(m + 1).padStart(2, "0");
  return `${y}-${monthStr}-01`;
}

function monthLabel(bucket: string): string {
  // bucket = "YYYY-MM-01"
  const m = parseInt(bucket.slice(5, 7), 10);
  return `${m}月`;
}

/** 列出近 N 月的 bucket（含本月、從舊到新） */
function buildMonthBuckets(months: number): string[] {
  const now = new Date();
  const tz = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const buckets: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(tz.getUTCFullYear(), tz.getUTCMonth() - i, 1));
    const monthStr = String(d.getUTCMonth() + 1).padStart(2, "0");
    buckets.push(`${d.getUTCFullYear()}-${monthStr}-01`);
  }
  return buckets;
}

function buildMonthlyTrend(rows: RawRow[], months: number): NpsTrendPoint[] {
  const map = new Map<
    string,
    { total: number; promoter: number; passive: number; detractor: number }
  >();
  const buckets = buildMonthBuckets(months);
  for (const b of buckets) {
    map.set(b, { total: 0, promoter: 0, passive: 0, detractor: 0 });
  }
  for (const r of rows) {
    const b = monthStart(r.responded_at);
    const cur = map.get(b);
    if (!cur) continue;
    cur.total++;
    const c = classifyScore(r.score);
    if (c === "promoter") cur.promoter++;
    else if (c === "passive") cur.passive++;
    else cur.detractor++;
  }
  return buckets.map((b) => {
    const v = map.get(b)!;
    const p = pct(v.promoter, v.total);
    const d = pct(v.detractor, v.total);
    return {
      bucket: b,
      label: monthLabel(b),
      total: v.total,
      promoter: v.promoter,
      passive: v.passive,
      detractor: v.detractor,
      npsScore: v.total > 0 ? Math.round(p - d) : 0,
    };
  });
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

/** SA / RS 卡片：reuse buildGroupBy 的結果，標 top / attention */
function buildSaCards(groups: NpsGroupRow[], minResponsesForBadge = 3): NpsSaCard[] {
  if (groups.length === 0) return [];
  const eligible = groups.filter((g) => g.total >= minResponsesForBadge);
  let topKey: string | null = null;
  let attKey: string | null = null;
  if (eligible.length >= 2) {
    const sortedDesc = [...eligible].sort((a, b) => b.npsScore - a.npsScore);
    topKey = sortedDesc[0].key;
    attKey = sortedDesc[sortedDesc.length - 1].key;
  } else if (eligible.length === 1) {
    topKey = eligible[0].key;
  }
  return groups.map((g) => {
    const total = g.total;
    return {
      name: g.label,
      total,
      avgScore: g.avgScore,
      npsScore: g.npsScore,
      promoterPct: pct(g.promoter, total),
      detractorPct: pct(g.detractor, total),
      badge: g.key === topKey ? "top" : g.key === attKey ? "attention" : null,
    };
  });
}

/** 從 metadata 撈 aspect_scores（單筆） */
function readAspectScore(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  if (!metadata) return null;
  const aspects = metadata["aspect_scores"];
  if (!aspects || typeof aspects !== "object") return null;
  const v = (aspects as Record<string, unknown>)[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function buildAspects(
  rows: RawRow[],
  prevRows: RawRow[],
  kind: NpsKind,
): NpsAspectRow[] {
  const order: readonly string[] =
    kind === "sales" ? SALES_ASPECT_ORDER : AFTERSALES_ASPECT_ORDER;
  const labelMap: Record<string, string> =
    kind === "sales"
      ? (SALES_ASPECT_LABEL as Record<SalesAspectKey, string>)
      : (AFTERSALES_ASPECT_LABEL as Record<AftersalesAspectKey, string>);

  const avgOf = (rs: RawRow[], key: string): number | null => {
    let sum = 0;
    let n = 0;
    for (const r of rs) {
      const v = readAspectScore(r.metadata, key);
      if (v !== null) {
        sum += v;
        n++;
      }
    }
    return n === 0 ? null : Math.round((sum * 10) / n) / 10;
  };

  return order.map((key) => {
    const cur = avgOf(rows, key);
    const prev = avgOf(prevRows, key);
    const delta =
      cur !== null && prev !== null ? Math.round((cur - prev) * 10) / 10 : null;
    return {
      key,
      label: labelMap[key] ?? key,
      avg: cur ?? 0,
      delta,
    };
  });
}

export async function getSalesNpsDashboard(
  filters: NpsFilters,
): Promise<SalesNpsDashboard> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const months = RANGE_MONTHS[filters.range];
  // 本期：近 N 個月（含本月）
  const now = new Date();
  const tz = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const curStart = new Date(
    Date.UTC(tz.getUTCFullYear(), tz.getUTCMonth() - (months - 1), 1),
  ).toISOString();
  // 上期：再往前 N 個月（用來算 delta）
  const prevStart = new Date(
    Date.UTC(tz.getUTCFullYear(), tz.getUTCMonth() - months * 2 + 1, 1),
  ).toISOString();

  const kind: NpsKind = filters.kind ?? "sales";

  const { data, error } = await supabase
    .from("nps_responses")
    .select(
      "id, score, category, comment, store_id, sales_person, customer_id, responded_at, metadata",
    )
    .eq("brand_id", brand)
    .eq("kind", kind)
    .gte("responded_at", prevStart)
    .order("responded_at", { ascending: false });
  if (error) throw error;
  const allRows = (data ?? []) as RawRow[];
  const curRows = allRows.filter((r) => r.responded_at >= curStart);
  const prevRows = allRows.filter(
    (r) => r.responded_at < curStart && r.responded_at >= prevStart,
  );

  // 撈 store / customer 名稱對應
  const [{ data: orgs }, { data: custs }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name")
      .eq("brand_id", brand)
      .eq("level", 2),
    supabase.from("customers").select("id, name").eq("brand_id", brand),
  ]);
  const storeMap = new Map<string, string>(
    (orgs ?? []).map((o) => [o.id as string, o.name as string]),
  );
  const custMap = new Map<string, string>(
    (custs ?? []).map((c) => [c.id as string, c.name as string]),
  );

  // 本期 KPI（含 delta vs 上期）
  const prevKpi = buildKpi(prevRows);
  const deltaVsPrev =
    prevRows.length > 0 ? Math.round(0 + (buildKpi(curRows).npsScore - prevKpi.npsScore)) : null;
  const kpi = buildKpi(curRows, deltaVsPrev);

  const trend = buildMonthlyTrend(curRows, months);
  const byStore = buildGroupBy(curRows, (r) => r.store_id, storeMap);
  const bySalesPerson = buildGroupBy(curRows, (r) => r.sales_person, new Map());
  const saCards = buildSaCards(bySalesPerson, 3);
  const aspects = buildAspects(curRows, prevRows, kind);

  const recentDetractors: NpsResponseRow[] = curRows
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
      service_type:
        typeof r.metadata?.["service_type"] === "string"
          ? (r.metadata["service_type"] as string)
          : null,
      responded_at: r.responded_at,
    }));

  return {
    kpi,
    trend,
    byStore,
    bySalesPerson,
    saCards,
    aspects,
    recentDetractors,
  };
}

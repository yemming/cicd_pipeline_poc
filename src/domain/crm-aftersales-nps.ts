/**
 * Domain helper — 售後 NPS 看板專屬（/crm/aftersales/nps，M02-7）
 *
 * 與 src/domain/sales-nps.ts 平行存在：
 *   - sales-nps 是 sales / aftersales 共用版（CRM05A / CRM05B 第一輪）
 *   - 本檔是 aftersales A 級升級版：支援 3m / 6m / 12m、SA / service_type filter、
 *     回傳 breakdownByService、escalated 狀態（從 nps_responses.metadata 讀）
 *
 * 純讀。UI / actions 都 import 自此檔；不會去 import sales-nps（除了重用 NPS 分類規則）。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  classifyScore,
  AFTERSALES_ASPECT_LABEL,
  AFTERSALES_ASPECT_ORDER,
  type NpsCategory,
} from "@/domain/sales-nps.constants";
import {
  AFTERSALES_NPS_RANGE_MONTHS,
  serviceTypeLabel,
  type AftersalesNpsRangeKey,
} from "@/domain/crm-aftersales-nps.constants";

export type AftersalesNpsKpi = {
  total: number;
  promoter: number;
  passive: number;
  detractor: number;
  promoterPct: number;
  passivePct: number;
  detractorPct: number;
  /** NPS 指數 = promoterPct - detractorPct（rounded 整數） */
  npsScore: number;
  avgScore: number;
  /** 本期 NPS - 上期 NPS；上期無樣本 = null */
  deltaVsPrev: number | null;
  /** 本期 detractor 中已升級 escalated 的數量（metadata.escalation 有值） */
  escalatedCount: number;
};

export type AftersalesNpsTrendPoint = {
  bucket: string; // YYYY-MM-01
  label: string; // 例：4月
  total: number;
  promoter: number;
  passive: number;
  detractor: number;
  npsScore: number;
};

export type AftersalesNpsGroupRow = {
  key: string;
  label: string;
  total: number;
  promoter: number;
  passive: number;
  detractor: number;
  npsScore: number;
  avgScore: number;
};

export type AftersalesAspectRow = {
  key: string;
  label: string;
  avg: number;
  delta: number | null;
};

export type AftersalesDetractorRow = {
  id: string;
  score: number;
  category: NpsCategory;
  customer_id: string | null;
  customer_name: string | null;
  sa_name: string | null;
  store_id: string | null;
  store_name: string | null;
  service_type: string | null;
  service_type_label: string;
  comment: string | null;
  responded_at: string;
  escalated: boolean;
  escalated_at: string | null;
  escalated_notes: string | null;
};

export type AftersalesNpsDashboard = {
  range: AftersalesNpsRangeKey;
  kpi: AftersalesNpsKpi;
  trend: AftersalesNpsTrendPoint[];
  bySa: AftersalesNpsGroupRow[];
  byService: AftersalesNpsGroupRow[];
  aspects: AftersalesAspectRow[];
  detractors: AftersalesDetractorRow[];
  saOptions: { value: string; label: string }[];
  serviceTypeOptions: { value: string; label: string }[];
};

export type AftersalesNpsFilters = {
  range: AftersalesNpsRangeKey;
  sa?: string | null;
  service_type?: string | null;
};

type RawRow = {
  id: string;
  score: number;
  category: string | null;
  comment: string | null;
  store_id: string | null;
  sales_person: string | null; // aftersales 仍存 SA 名
  customer_id: string | null;
  responded_at: string;
  metadata: Record<string, unknown> | null;
};

function pct(n: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((n * 1000) / total) / 10;
}

function getServiceType(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  const v = metadata["service_type"];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function getEscalation(
  metadata: Record<string, unknown> | null | undefined,
): { escalated_at: string; notes: string | null } | null {
  if (!metadata) return null;
  const esc = metadata["escalation"];
  if (!esc || typeof esc !== "object") return null;
  const e = esc as Record<string, unknown>;
  const at = e["escalated_at"];
  if (typeof at !== "string") return null;
  return {
    escalated_at: at,
    notes: typeof e["notes"] === "string" ? (e["notes"] as string) : null,
  };
}

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

function emptyKpi(deltaVsPrev: number | null = null): AftersalesNpsKpi {
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
    deltaVsPrev,
    escalatedCount: 0,
  };
}

function buildKpi(rows: RawRow[], deltaVsPrev: number | null = null): AftersalesNpsKpi {
  if (rows.length === 0) return emptyKpi(deltaVsPrev);
  let promoter = 0;
  let passive = 0;
  let detractor = 0;
  let sum = 0;
  let escalatedCount = 0;
  for (const r of rows) {
    const c = classifyScore(r.score);
    if (c === "promoter") promoter++;
    else if (c === "passive") passive++;
    else detractor++;
    sum += r.score;
    if (c === "detractor" && getEscalation(r.metadata)) escalatedCount++;
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
    escalatedCount,
  };
}

function monthStart(iso: string): string {
  const d = new Date(iso);
  const tz = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const y = tz.getUTCFullYear();
  const m = tz.getUTCMonth();
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

function monthLabel(bucket: string): string {
  const m = parseInt(bucket.slice(5, 7), 10);
  return `${m}月`;
}

function buildMonthBuckets(months: number): string[] {
  const now = new Date();
  const tz = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const buckets: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(tz.getUTCFullYear(), tz.getUTCMonth() - i, 1));
    buckets.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`,
    );
  }
  return buckets;
}

function buildTrend(rows: RawRow[], months: number): AftersalesNpsTrendPoint[] {
  const buckets = buildMonthBuckets(months);
  const map = new Map<
    string,
    { total: number; promoter: number; passive: number; detractor: number }
  >();
  for (const b of buckets) map.set(b, { total: 0, promoter: 0, passive: 0, detractor: 0 });
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

function buildGroup(
  rows: RawRow[],
  keyFn: (r: RawRow) => string | null,
  labelFn: (key: string) => string,
): AftersalesNpsGroupRow[] {
  const map = new Map<
    string,
    { total: number; promoter: number; passive: number; detractor: number; sum: number }
  >();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    const cur =
      map.get(k) ?? { total: 0, promoter: 0, passive: 0, detractor: 0, sum: 0 };
    cur.total++;
    cur.sum += r.score;
    const c = classifyScore(r.score);
    if (c === "promoter") cur.promoter++;
    else if (c === "passive") cur.passive++;
    else cur.detractor++;
    map.set(k, cur);
  }
  const out: AftersalesNpsGroupRow[] = [];
  for (const [k, v] of map) {
    const promoterPct = pct(v.promoter, v.total);
    const detractorPct = pct(v.detractor, v.total);
    out.push({
      key: k,
      label: labelFn(k),
      total: v.total,
      promoter: v.promoter,
      passive: v.passive,
      detractor: v.detractor,
      npsScore: Math.round(promoterPct - detractorPct),
      avgScore: v.total > 0 ? Math.round((v.sum * 10) / v.total) / 10 : 0,
    });
  }
  out.sort((a, b) => b.total - a.total);
  return out;
}

function buildAspects(
  curRows: RawRow[],
  prevRows: RawRow[],
): AftersalesAspectRow[] {
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
  return AFTERSALES_ASPECT_ORDER.map((key) => {
    const cur = avgOf(curRows, key);
    const prev = avgOf(prevRows, key);
    const delta =
      cur !== null && prev !== null ? Math.round((cur - prev) * 10) / 10 : null;
    return {
      key,
      label: AFTERSALES_ASPECT_LABEL[key],
      avg: cur ?? 0,
      delta,
    };
  });
}

export async function getAftersalesNpsDashboard(
  filters: AftersalesNpsFilters,
): Promise<AftersalesNpsDashboard> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const months = AFTERSALES_NPS_RANGE_MONTHS[filters.range];
  const now = new Date();
  const tz = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const curStart = new Date(
    Date.UTC(tz.getUTCFullYear(), tz.getUTCMonth() - (months - 1), 1),
  ).toISOString();
  const prevStart = new Date(
    Date.UTC(tz.getUTCFullYear(), tz.getUTCMonth() - months * 2 + 1, 1),
  ).toISOString();

  const { data, error } = await supabase
    .from("nps_responses")
    .select(
      "id, score, category, comment, store_id, sales_person, customer_id, responded_at, metadata",
    )
    .eq("brand_id", brand)
    .eq("kind", "aftersales")
    .gte("responded_at", prevStart)
    .order("responded_at", { ascending: false });
  if (error) throw error;
  const allRows = (data ?? []) as RawRow[];

  // 切本期 / 上期
  const curRowsRaw = allRows.filter((r) => r.responded_at >= curStart);
  const prevRowsRaw = allRows.filter(
    (r) => r.responded_at < curStart && r.responded_at >= prevStart,
  );

  // 撈 customer / store 名稱對應（不論 filter 都要顯示得出來）
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

  // dropdown options（取自「未 filter 前」的本期 + 上期樣本，方便 user 切換）
  const saSet = new Set<string>();
  const serviceSet = new Set<string>();
  for (const r of allRows) {
    if (r.sales_person) saSet.add(r.sales_person);
    const st = getServiceType(r.metadata);
    if (st) serviceSet.add(st);
  }
  const saOptions = Array.from(saSet)
    .sort()
    .map((s) => ({ value: s, label: s }));
  const serviceTypeOptions = Array.from(serviceSet)
    .sort()
    .map((s) => ({ value: s, label: serviceTypeLabel(s) }));

  // 套 filter（sa / service_type）— filter 同步套 cur + prev，這樣 delta 才有意義
  const passes = (r: RawRow): boolean => {
    if (filters.sa && r.sales_person !== filters.sa) return false;
    if (filters.service_type) {
      const st = getServiceType(r.metadata);
      if (st !== filters.service_type) return false;
    }
    return true;
  };
  const curRows = curRowsRaw.filter(passes);
  const prevRows = prevRowsRaw.filter(passes);

  // KPI（含 delta vs 上期）
  const prevKpi = buildKpi(prevRows);
  const deltaVsPrev =
    prevRows.length > 0 ? buildKpi(curRows).npsScore - prevKpi.npsScore : null;
  const kpi = buildKpi(curRows, deltaVsPrev);

  const trend = buildTrend(curRows, months);
  const bySa = buildGroup(curRows, (r) => r.sales_person, (k) => k);
  const byService = buildGroup(
    curRows,
    (r) => getServiceType(r.metadata) ?? "unknown",
    (k) => serviceTypeLabel(k),
  );
  const aspects = buildAspects(curRows, prevRows);

  // detractor list（評分 ≤ 6 的全部，依日期 desc）
  const detractors: AftersalesDetractorRow[] = curRows
    .filter((r) => classifyScore(r.score) === "detractor")
    .map((r) => {
      const esc = getEscalation(r.metadata);
      const st = getServiceType(r.metadata);
      return {
        id: r.id,
        score: r.score,
        category: classifyScore(r.score),
        customer_id: r.customer_id,
        customer_name: r.customer_id ? (custMap.get(r.customer_id) ?? null) : null,
        sa_name: r.sales_person,
        store_id: r.store_id,
        store_name: r.store_id ? (storeMap.get(r.store_id) ?? null) : null,
        service_type: st,
        service_type_label: serviceTypeLabel(st),
        comment: r.comment,
        responded_at: r.responded_at,
        escalated: esc !== null,
        escalated_at: esc?.escalated_at ?? null,
        escalated_notes: esc?.notes ?? null,
      };
    });

  return {
    range: filters.range,
    kpi,
    trend,
    bySa,
    byService,
    aspects,
    detractors,
    saOptions,
    serviceTypeOptions,
  };
}

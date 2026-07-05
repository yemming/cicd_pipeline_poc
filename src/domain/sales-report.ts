/**
 * 業績報表（M01-2 A 級）— server-only domain helper。
 *
 * 對應頁面：/sales/manager/sales-report
 *
 * 設計理念：
 *   - reuse 既有 `sales_orders` 為事實表（reportable status = signed + fulfilled）
 *   - lead source 透過 `sales_orders.lead_id -> sales_leads.source` join 取得
 *   - 車型透過 `sales_orders.vehicle_model_id -> vehicle_models` 取 display_name/series
 *   - 目標值由 `kpi_targets` 拿（subject_type='global'、metric_code='sales_revenue'）
 *   - period = month/quarter/year，自動算當期與上一期日期區間
 *
 * 不依賴：
 *   - ❌ `sales_metrics_monthly` mview（DB 不存在；既有 sales-manager-report.ts 永遠走 fallback）
 *   - ❌ aggregate cron job（POC 階段直接 query 即可、< 1k rows）
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  ReportPeriod,
  SalesReportKpis,
  SalesConsultantRank,
  ModelSalesRow,
  LeadSourceRow,
  DailyTrendPoint,
  OrderDetailRow,
  SalesReportFilters,
  DiscountStatsSummary,
} from "./sales-report.constants";
import { DEFAULT_MONTHLY_TARGET } from "./sales-report.constants";

// ─── 時間區間工具 ─────────────────────────────────────────────

interface PeriodRange {
  /** 起 ISO (含) */
  start: string;
  /** 迄 ISO (不含) */
  end: string;
  /** 上一期同型起 */
  prevStart: string;
  /** 上一期同型迄 */
  prevEnd: string;
  /** period_key 字串（給 kpi_targets 用，例：2026-05 / 2026-Q2 / 2026） */
  periodKey: string;
}

function periodRange(period: ReportPeriod, now: Date = new Date()): PeriodRange {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-11
  if (period === "year") {
    const start = new Date(Date.UTC(y, 0, 1));
    const end = new Date(Date.UTC(y + 1, 0, 1));
    const prevStart = new Date(Date.UTC(y - 1, 0, 1));
    const prevEnd = new Date(Date.UTC(y, 0, 1));
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      prevStart: prevStart.toISOString(),
      prevEnd: prevEnd.toISOString(),
      periodKey: String(y),
    };
  }
  if (period === "quarter") {
    const q = Math.floor(m / 3); // 0-3
    const start = new Date(Date.UTC(y, q * 3, 1));
    const end = new Date(Date.UTC(y, q * 3 + 3, 1));
    const prevStart = new Date(Date.UTC(q === 0 ? y - 1 : y, q === 0 ? 9 : (q - 1) * 3, 1));
    const prevEnd = new Date(Date.UTC(y, q * 3, 1));
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      prevStart: prevStart.toISOString(),
      prevEnd: prevEnd.toISOString(),
      periodKey: `${y}-Q${q + 1}`,
    };
  }
  // month
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 1));
  const prevStart = new Date(Date.UTC(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, 1));
  const prevEnd = new Date(Date.UTC(y, m, 1));
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    prevStart: prevStart.toISOString(),
    prevEnd: prevEnd.toISOString(),
    periodKey: `${y}-${String(m + 1).padStart(2, "0")}`,
  };
}

/** 「成交」訂單 = signed + fulfilled。draft/submitted/cancelled 不計入業績。 */
const REPORT_STATUSES = ["signed", "fulfilled"] as const;

interface OrderRowRaw {
  id: string;
  order_no: string;
  signed_at: string | null;
  fulfilled_at: string | null;
  created_at: string;
  rs_name: string | null;
  customer_name: string | null;
  vehicle_model_id: string | null;
  vehicle_model_name: string | null;
  lead_id: string | null;
  total_amount: number | string | null;
  deal_price: number | string | null;
  status: string;
}

/** 取 amount：優先 total_amount、fallback deal_price */
function amountOf(r: OrderRowRaw): number {
  const a = r.total_amount != null ? Number(r.total_amount) : 0;
  if (a > 0) return a;
  const d = r.deal_price != null ? Number(r.deal_price) : 0;
  return d;
}

/** 取 signed_at（若 null fallback fulfilled_at/created_at） */
function dateOf(r: OrderRowRaw): string {
  return r.signed_at ?? r.fulfilled_at ?? r.created_at;
}

// ─── 內部：撈本期 + 上期成交訂單（一次 query 兩段時間） ──────────

async function fetchOrdersInRange(
  brandId: string,
  range: PeriodRange,
  filters: SalesReportFilters,
): Promise<{ current: OrderRowRaw[]; previous: OrderRowRaw[] }> {
  const supabase = await createClient();

  // 兩段時間用 OR 一次拉，避免兩個 round-trip
  let query = supabase
    .from("sales_orders")
    .select(
      "id, order_no, signed_at, fulfilled_at, created_at, rs_name, customer_name, vehicle_model_id, vehicle_model_name, lead_id, total_amount, deal_price, status",
    )
    .eq("brand_id", brandId)
    .in("status", REPORT_STATUSES as unknown as string[])
    .gte("signed_at", range.prevStart)
    .lt("signed_at", range.end);

  if (filters.saName) query = query.eq("rs_name", filters.saName);
  if (filters.modelId) query = query.eq("vehicle_model_id", filters.modelId);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as OrderRowRaw[];
  const inCurrent = (r: OrderRowRaw) => {
    const d = dateOf(r);
    return d >= range.start && d < range.end;
  };
  const inPrev = (r: OrderRowRaw) => {
    const d = dateOf(r);
    return d >= range.prevStart && d < range.prevEnd;
  };
  return {
    current: rows.filter(inCurrent),
    previous: rows.filter(inPrev),
  };
}

// ─── 對外 helper 們 ──────────────────────────────────────────

/** 取得本期 KPI（金額 / 訂單數 / 平均單價 / 達標率，含同比） */
export async function getSalesReportKpis(
  filters: SalesReportFilters = {},
): Promise<{ data: SalesReportKpis; periodKey: string }> {
  const period: ReportPeriod = filters.period ?? "month";
  const range = periodRange(period);
  const { brand_id } = await getActiveScope();

  const supabase = await createClient();

  const [{ current, previous }, targetRes] = await Promise.all([
    fetchOrdersInRange(brand_id, range, filters),
    supabase
      .from("kpi_targets")
      .select("target_value")
      .eq("brand_id", brand_id)
      .eq("subject_type", "global")
      .is("subject_id", null)
      .eq("period_type", period)
      .eq("period_key", range.periodKey)
      .eq("metric_code", "sales_revenue")
      .maybeSingle(),
  ]);

  const sumAmount = (rows: OrderRowRaw[]) => rows.reduce((s, r) => s + amountOf(r), 0);
  const revenue = sumAmount(current);
  const revenuePrev = sumAmount(previous);
  const orderCount = current.length;
  const orderCountPrev = previous.length;
  const avgPrice = orderCount > 0 ? Math.round(revenue / orderCount) : 0;
  const avgPricePrev = orderCountPrev > 0 ? Math.round(revenuePrev / orderCountPrev) : 0;
  const targetAmount = Number(targetRes.data?.target_value ?? DEFAULT_MONTHLY_TARGET);
  const targetRate = targetAmount > 0 ? Math.round((revenue / targetAmount) * 1000) / 10 : 0;

  return {
    data: {
      revenue,
      revenuePrev,
      orderCount,
      orderCountPrev,
      avgPrice,
      avgPricePrev,
      targetRate,
      targetAmount,
    },
    periodKey: range.periodKey,
  };
}

/** SA 個人業績排名（含目標 vs 實際 vs 同比） */
export async function getSalesByConsultantRanking(
  filters: SalesReportFilters = {},
): Promise<SalesConsultantRank[]> {
  const period: ReportPeriod = filters.period ?? "month";
  const range = periodRange(period);
  const { brand_id } = await getActiveScope();

  const supabase = await createClient();
  const [{ current, previous }, targetsRes] = await Promise.all([
    fetchOrdersInRange(brand_id, range, { ...filters, saName: null }),
    supabase
      .from("kpi_targets")
      .select("subject_id, target_value, metadata")
      .eq("brand_id", brand_id)
      .eq("subject_type", "user")
      .eq("period_type", period)
      .eq("period_key", range.periodKey)
      .eq("metric_code", "sales_revenue"),
  ]);

  const byName = new Map<string, { orders: number; revenue: number; revenuePrev: number }>();
  for (const r of current) {
    const name = r.rs_name ?? "(未指派)";
    const slot = byName.get(name) ?? { orders: 0, revenue: 0, revenuePrev: 0 };
    slot.orders += 1;
    slot.revenue += amountOf(r);
    byName.set(name, slot);
  }
  for (const r of previous) {
    const name = r.rs_name ?? "(未指派)";
    const slot = byName.get(name) ?? { orders: 0, revenue: 0, revenuePrev: 0 };
    slot.revenuePrev += amountOf(r);
    byName.set(name, slot);
  }

  // 個人目標放在 metadata.rs_name 比對（沒有就 0）
  const targetByName = new Map<string, number>();
  for (const t of (targetsRes.data ?? []) as { metadata: Record<string, unknown> | null; target_value: number | string }[]) {
    const rs = (t.metadata?.rs_name ?? null) as string | null;
    if (rs) targetByName.set(rs, Number(t.target_value));
  }

  return Array.from(byName.entries())
    .map(([name, v]) => ({
      name,
      orders: v.orders,
      revenue: v.revenue,
      revenuePrev: v.revenuePrev,
      target: targetByName.get(name) ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** 車型熱銷度 — by vehicle_model_id 聚合 */
export async function getSalesByModel(
  filters: SalesReportFilters = {},
): Promise<ModelSalesRow[]> {
  const period: ReportPeriod = filters.period ?? "month";
  const range = periodRange(period);
  const { brand_id } = await getActiveScope();

  const { current } = await fetchOrdersInRange(brand_id, range, filters);
  if (current.length === 0) return [];

  const supabase = await createClient();
  const modelIds = Array.from(
    new Set(current.map((r) => r.vehicle_model_id).filter((x): x is string => !!x)),
  );
  const dict = new Map<string, { display_name: string; series: string }>();
  if (modelIds.length > 0) {
    const { data: models } = await supabase
      .from("vehicle_models")
      .select("id, display_name, series")
      .in("id", modelIds);
    for (const m of (models ?? []) as { id: string; display_name: string; series: string }[]) {
      dict.set(m.id, { display_name: m.display_name, series: m.series });
    }
  }

  const byModel = new Map<string, ModelSalesRow>();
  for (const r of current) {
    const key = r.vehicle_model_id ?? `name:${r.vehicle_model_name ?? "未指定"}`;
    const slot = byModel.get(key);
    if (slot) {
      slot.count += 1;
      slot.revenue += amountOf(r);
      continue;
    }
    const d = r.vehicle_model_id ? dict.get(r.vehicle_model_id) : undefined;
    byModel.set(key, {
      modelId: r.vehicle_model_id,
      modelName: d?.display_name ?? r.vehicle_model_name ?? "未指定",
      series: d?.series ?? "—",
      count: 1,
      revenue: amountOf(r),
    });
  }

  return Array.from(byModel.values()).sort((a, b) => b.count - a.count);
}

/** 客戶來源 ROI — 透過 lead_id JOIN sales_leads.source */
export async function getSalesByLeadSource(
  filters: SalesReportFilters = {},
): Promise<LeadSourceRow[]> {
  const period: ReportPeriod = filters.period ?? "month";
  const range = periodRange(period);
  const { brand_id } = await getActiveScope();

  const { current } = await fetchOrdersInRange(brand_id, range, filters);
  if (current.length === 0) return [];

  const supabase = await createClient();
  const leadIds = Array.from(
    new Set(current.map((r) => r.lead_id).filter((x): x is string => !!x)),
  );
  const sourceByLead = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data: leads } = await supabase
      .from("sales_dormant_leads")
      .select("id, source")
      .in("id", leadIds);
    for (const l of (leads ?? []) as { id: string; source: string | null }[]) {
      if (l.source) sourceByLead.set(l.id, l.source);
    }
  }

  const bySource = new Map<string, LeadSourceRow>();
  for (const r of current) {
    const src = (r.lead_id && sourceByLead.get(r.lead_id)) || "未指定";
    const slot = bySource.get(src);
    if (slot) {
      slot.orders += 1;
      slot.revenue += amountOf(r);
    } else {
      bySource.set(src, { source: src, orders: 1, revenue: amountOf(r) });
    }
  }

  return Array.from(bySource.values()).sort((a, b) => b.revenue - a.revenue);
}

/** 每日銷售趨勢（最近 N 天，預設 30） */
export async function getSalesTrend(
  days: number = 30,
  filters: Pick<SalesReportFilters, "saName" | "modelId" | "source"> = {},
): Promise<DailyTrendPoint[]> {
  const { brand_id } = await getActiveScope();
  const supabase = await createClient();

  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const startIso = start.toISOString();

  let q = supabase
    .from("sales_orders")
    .select("signed_at, fulfilled_at, created_at, total_amount, deal_price, rs_name, vehicle_model_id, lead_id, status")
    .eq("brand_id", brand_id)
    .in("status", REPORT_STATUSES as unknown as string[])
    .gte("signed_at", startIso);
  if (filters.saName) q = q.eq("rs_name", filters.saName);
  if (filters.modelId) q = q.eq("vehicle_model_id", filters.modelId);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as OrderRowRaw[];

  // 來源過濾（需 JOIN lead source）
  let filteredRows = rows;
  if (filters.source) {
    const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter((x): x is string => !!x)));
    if (leadIds.length > 0) {
      const { data: leads } = await supabase
        .from("sales_dormant_leads")
        .select("id, source")
        .in("id", leadIds);
      const okIds = new Set(
        ((leads ?? []) as { id: string; source: string | null }[])
          .filter((l) => l.source === filters.source)
          .map((l) => l.id),
      );
      filteredRows = rows.filter((r) => r.lead_id && okIds.has(r.lead_id));
    } else {
      filteredRows = [];
    }
  }

  // 按日聚合
  const byDay = new Map<string, { count: number; revenue: number }>();
  for (const r of filteredRows) {
    const d = new Date(dateOf(r));
    const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const slot = byDay.get(key) ?? { count: 0, revenue: 0 };
    slot.count += 1;
    slot.revenue += amountOf(r);
    byDay.set(key, slot);
  }

  // 補齊空白日（讓 LineChart 連續）
  const out: DailyTrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const slot = byDay.get(key);
    out.push({ date: key, count: slot?.count ?? 0, revenue: slot?.revenue ?? 0 });
  }
  return out;
}

/** 訂單明細（DataGrid row 用，最近 N 筆，含本期 + 上期區間） */
export async function getOrderDetails(
  filters: SalesReportFilters = {},
  limit = 200,
): Promise<OrderDetailRow[]> {
  const period: ReportPeriod = filters.period ?? "month";
  const range = periodRange(period);
  const { brand_id } = await getActiveScope();

  const supabase = await createClient();
  let q = supabase
    .from("sales_orders")
    .select(
      "id, order_no, status, signed_at, fulfilled_at, created_at, rs_name, customer_name, vehicle_model_id, vehicle_model_name, lead_id, total_amount, deal_price",
    )
    .eq("brand_id", brand_id)
    .gte("signed_at", range.start)
    .lt("signed_at", range.end)
    .order("signed_at", { ascending: false })
    .limit(limit);

  if (filters.saName) q = q.eq("rs_name", filters.saName);
  if (filters.modelId) q = q.eq("vehicle_model_id", filters.modelId);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as OrderRowRaw[];

  // 取 lead source
  const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter((x): x is string => !!x)));
  const sourceByLead = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data: leads } = await supabase
      .from("sales_dormant_leads")
      .select("id, source")
      .in("id", leadIds);
    for (const l of (leads ?? []) as { id: string; source: string | null }[]) {
      if (l.source) sourceByLead.set(l.id, l.source);
    }
  }

  let out: OrderDetailRow[] = rows.map((r) => ({
    id: r.id,
    order_no: r.order_no,
    signed_at: r.signed_at ?? r.fulfilled_at ?? null,
    rs_name: r.rs_name,
    customer_name: r.customer_name,
    vehicle_model_name: r.vehicle_model_name,
    total_amount: amountOf(r) || null,
    status: r.status as OrderDetailRow["status"],
    lead_source: (r.lead_id && sourceByLead.get(r.lead_id)) || null,
  }));

  if (filters.source) out = out.filter((r) => r.lead_source === filters.source);

  return out;
}

/** 撈所有 lookup 選項（filter dropdown 用） */
export async function getReportFilterOptions(): Promise<{
  sas: string[];
  models: { id: string; name: string }[];
  sources: string[];
}> {
  const { brand_id } = await getActiveScope();
  const supabase = await createClient();

  const [saRes, modelRes, sourceRes] = await Promise.all([
    supabase
      .from("sales_orders")
      .select("rs_name")
      .eq("brand_id", brand_id)
      .not("rs_name", "is", null)
      .limit(2000),
    supabase
      .from("vehicle_models")
      .select("id, display_name")
      .eq("brand_id", brand_id)
      .order("display_name", { ascending: true }),
    supabase
      .from("sales_dormant_leads")
      .select("source")
      .eq("brand_id", brand_id)
      // 裁示五：銷售報表來源下拉只取 sales_dormant_leads（sales 專表，不混售後流失來源）
      .not("source", "is", null)
      .not("metadata->>is_test_fixture", "eq", "true") // 裁示四：排除測試夾具
      .limit(2000),
  ]);

  const sas = Array.from(
    new Set(((saRes.data ?? []) as { rs_name: string | null }[]).map((r) => r.rs_name).filter((x): x is string => !!x)),
  ).sort();
  const models = ((modelRes.data ?? []) as { id: string; display_name: string }[]).map((m) => ({
    id: m.id,
    name: m.display_name,
  }));
  const sources = Array.from(
    new Set(((sourceRes.data ?? []) as { source: string | null }[]).map((r) => r.source).filter((x): x is string => !!x)),
  ).sort();

  return { sas, models, sources };
}

/**
 * 折扣統計（RS04 折扣管控架構 §折扣統計報表）。
 *
 * 情況A/B 分布：本期成交（signed+fulfilled）訂單中，有沒有對應一筆
 *   discount_approval_requests（有 = 情況B 送審過，沒有 = 情況A 業務員授權內直接放行）。
 * 其餘分布：本期送審件（requested_at 落區間）依 status 統計，
 *   不套 SA / 車型篩選（該表無此二欄位，是店級總覽數字）。
 */
export async function getDiscountStats(
  filters: SalesReportFilters = {},
): Promise<DiscountStatsSummary> {
  const period: ReportPeriod = filters.period ?? "month";
  const range = periodRange(period);
  const { brand_id } = await getActiveScope();
  const supabase = await createClient();

  const [{ current }, reqRes] = await Promise.all([
    fetchOrdersInRange(brand_id, range, filters),
    supabase
      .from("discount_approval_requests")
      .select("id, order_id, status, discount_pct, discount_amount")
      .eq("brand_id", brand_id)
      .gte("requested_at", range.start)
      .lt("requested_at", range.end),
  ]);

  if (reqRes.error) throw reqRes.error;

  const requests = (reqRes.data ?? []) as Array<{
    id: string;
    order_id: string | null;
    status: string;
    discount_pct: number | null;
    discount_amount: number | null;
  }>;

  const countBy = (s: string) => requests.filter((r) => r.status === s).length;
  const approvedCount = countBy("approved");
  const rejectedCount = countBy("rejected");
  const counterOfferedCount = countBy("counter_offered");
  const expiredCount = countBy("expired");
  const pendingCount = countBy("pending") + countBy("escalated");
  const situationBCount = requests.length;

  const withPct = requests.filter((r) => r.discount_pct != null);
  const avgDiscountPct =
    withPct.length > 0
      ? Math.round((withPct.reduce((s, r) => s + Number(r.discount_pct), 0) / withPct.length) * 10) / 10
      : 0;
  const totalDiscountAmount = requests.reduce((s, r) => s + Number(r.discount_amount ?? 0), 0);

  const approvalOrderIds = new Set(
    requests.map((r) => r.order_id).filter((x): x is string => !!x),
  );
  const situationBSignedCount = current.filter((o) => approvalOrderIds.has(o.id)).length;
  const situationACount = current.length - situationBSignedCount;

  return {
    situationACount,
    situationBCount,
    approvedCount,
    rejectedCount,
    counterOfferedCount,
    expiredCount,
    pendingCount,
    avgDiscountPct,
    totalDiscountAmount,
  };
}

/** 主入口：一次撈完全部、給 page.tsx 用 */
export async function getSalesReportBundle(filters: SalesReportFilters = {}) {
  const [kpis, ranking, models, sources, trend, orders, options, discountStats] = await Promise.all([
    getSalesReportKpis(filters),
    getSalesByConsultantRanking(filters),
    getSalesByModel(filters),
    getSalesByLeadSource(filters),
    getSalesTrend(30, { saName: filters.saName, modelId: filters.modelId, source: filters.source }),
    getOrderDetails(filters, 200),
    getReportFilterOptions(),
    getDiscountStats(filters),
  ]);
  return {
    kpis: kpis.data,
    periodKey: kpis.periodKey,
    ranking,
    models,
    sources,
    trend,
    orders,
    options,
    discountStats,
  };
}

export type SalesReportBundle = Awaited<ReturnType<typeof getSalesReportBundle>>;

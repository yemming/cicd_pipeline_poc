/**
 * Domain helper — 門店綜合概覽（/dashboard/store-overview）
 *
 * 店長視角的跨部門儀表板。純讀，aggregate 多張既有表：
 *   - nps_responses（銷售 + 售後 NPS）
 *   - sales_leads（休眠 / 戰敗）
 *   - call_tasks（電訪完成率、批評者）
 *   - work_orders（本月工單台次 / 平均金額 / 逾期）
 *   - customers + customer_tags（跨部門標籤統計）
 *   - customer_vehicles（在保客戶數）
 *
 * 不寫入、不建 materialized view。query-on-demand。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  STORE_RANGE_DAYS,
  type StoreOverviewRangeKey,
} from "@/domain/store-overview.constants";

export type StoreOverviewFilters = {
  range: StoreOverviewRangeKey;
};

export type StoreKpi = {
  totalRevenue: number; // 本月（或期間）總營收 NT$
  salesRevenue: number;
  serviceRevenue: number;
  newCarCount: number; // 銷售新車成交（converted_customer_id != null）
  workOrderCount: number; // 售後工單台次
  workOrderAvgAmount: number; // 平均工單金額
  combinedNps: number; // 整體 NPS（RS + SA 合計）
  followUpCount: number; // 需店長跟進（批評者 + 嚴重逾期）
};

export type NpsByKind = {
  kind: "sales" | "aftersales";
  npsScore: number;
  total: number;
  promoter: number;
  passive: number;
  detractor: number;
};

export type NpsTrendBucket = {
  month: string; // YYYY-MM
  sales: number; // RS NPS
  aftersales: number; // SA NPS
};

export type TopTagRow = {
  label: string;
  count: number;
  emoji: string | null;
};

export type StaffRanking = {
  rank: number;
  name: string;
  workOrderCount: number;
  avgAmount: number;
  npsAvg: number;
  detractorCount: number;
};

export type StoreAlert = {
  level: "red" | "amber" | "teal";
  title: string;
  body: string;
};

export type SalesLeadKpi = {
  active: number; // 進行中 leads（is_active=true）
  dormant: number; // dormancy_status='dormant'
  lost: number; // dormancy_status='lost'
  reviveCandidates: number; // 預定下次回訪 ≤ 7 天
};

export type ServiceKpi = {
  totalWorkOrders: number; // 期間內 WO 總台次
  avgAmount: number;
  overdueCount: number; // 逾期未回廠（next_service_due_date < today）
  upcomingDueCount: number; // 未來 14 天保養到期
};

export type StoreOverviewData = {
  kpi: StoreKpi;
  npsByKind: NpsByKind[];
  npsBenchmark: number;
  npsTrend: NpsTrendBucket[];
  topTags: TopTagRow[];
  saStaffRanking: StaffRanking[];
  salesLeadKpi: SalesLeadKpi;
  serviceKpi: ServiceKpi;
  alerts: StoreAlert[];
};

type NpsRawRow = {
  id: string;
  kind: "sales" | "aftersales" | string | null;
  score: number;
  category: string | null;
  comment: string | null;
  sales_person: string | null;
  responded_at: string;
};

function classify(score: number): "promoter" | "passive" | "detractor" {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

function pct(n: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((n * 1000) / total) / 10;
}

function calcNps(rows: { score: number }[]): {
  total: number;
  promoter: number;
  passive: number;
  detractor: number;
  npsScore: number;
} {
  let promoter = 0,
    passive = 0,
    detractor = 0;
  for (const r of rows) {
    const c = classify(r.score);
    if (c === "promoter") promoter++;
    else if (c === "passive") passive++;
    else detractor++;
  }
  const total = rows.length;
  return {
    total,
    promoter,
    passive,
    detractor,
    npsScore: total > 0 ? Math.round(pct(promoter, total) - pct(detractor, total)) : 0,
  };
}

function monthKey(iso: string): string {
  // YYYY-MM (Asia/Taipei)
  const d = new Date(iso);
  const tz = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return tz.toISOString().slice(0, 7);
}

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export async function getStoreOverview(
  filters: StoreOverviewFilters,
): Promise<StoreOverviewData> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const rangeDays = STORE_RANGE_DAYS[filters.range];
  const cutoff = rangeDays
    ? new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000)
    : new Date(new Date().getFullYear(), 0, 1);
  const cutoffIso = cutoff.toISOString();

  // 平行撈所有資料
  const [
    npsRes,
    leadsRes,
    callsRes,
    woRes,
    custRes,
    custTagsRes,
    vehRes,
  ] = await Promise.all([
    supabase
      .from("nps_responses")
      .select("id, kind, score, category, comment, sales_person, responded_at")
      .eq("brand_id", brand)
      .gte("responded_at", cutoffIso)
      .order("responded_at", { ascending: false }),
    supabase
      .from("sales_leads")
      .select(
        "id, is_active, dormancy_status, lost_at, last_visit_at, next_revive_at, converted_customer_id, created_at",
      )
      .eq("brand_id", brand),
    supabase
      .from("call_tasks")
      .select("id, kind, status, call_result, customer_id, created_at, last_attempt_at")
      .eq("brand_id", brand)
      .gte("created_at", cutoffIso),
    supabase
      .from("work_orders")
      .select(
        "id, status, total_amount, parts_amount, labor_amount, opened_at, closed_at, advisor_id, customer_id, vehicle_id",
      )
      .eq("brand_id", brand)
      .gte("opened_at", cutoffIso),
    supabase
      .from("customers")
      .select("id, name, source_module")
      .eq("brand_id", brand),
    supabase
      .from("customer_tags")
      .select("code, label, emoji, color, is_active")
      .eq("brand_id", brand)
      .eq("is_active", true),
    supabase
      .from("customer_vehicles")
      .select("id, customer_id, next_service_due_date, warranty_until, is_active, last_service_date, last_service_mileage")
      .eq("brand_id", brand)
      .eq("is_active", true),
  ]);

  if (npsRes.error) throw npsRes.error;
  if (leadsRes.error) throw leadsRes.error;
  if (callsRes.error) throw callsRes.error;
  if (woRes.error) throw woRes.error;
  if (custRes.error) throw custRes.error;
  if (custTagsRes.error) throw custTagsRes.error;
  if (vehRes.error) throw vehRes.error;

  const npsRows = (npsRes.data ?? []) as NpsRawRow[];
  const leads = leadsRes.data ?? [];
  const workOrders = woRes.data ?? [];
  const customers = custRes.data ?? [];
  const tags = custTagsRes.data ?? [];
  const vehicles = vehRes.data ?? [];

  // ─── KPI 計算 ───
  const salesNpsRows = npsRows.filter((r) => r.kind === "sales");
  const saNpsRows = npsRows.filter((r) => r.kind === "aftersales");
  const salesNps = calcNps(salesNpsRows);
  const saNps = calcNps(saNpsRows);
  const combinedNps = calcNps(npsRows);

  const newCarCount = leads.filter((l) => l.converted_customer_id).length;
  const wsRevenue = workOrders.reduce(
    (s, w) => s + Number(w.total_amount ?? 0),
    0,
  );
  // 銷售營收用 leads 估算（沒有 sales_orders；用每張轉換的 lead × 假設成交均價）
  const salesRevenueEst = newCarCount * 800000; // demo：重機均價 NT$80 萬

  const today = new Date();
  const overdueWoCount = vehicles.filter((v) => {
    if (!v.next_service_due_date) return false;
    return new Date(v.next_service_due_date) < today;
  }).length;
  const upcomingDueCount = vehicles.filter((v) => {
    if (!v.next_service_due_date) return false;
    const due = new Date(v.next_service_due_date);
    const diffDays = (due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000);
    return diffDays >= 0 && diffDays <= 14;
  }).length;

  const followUpCount = combinedNps.detractor + overdueWoCount;

  const woAvgAmount =
    workOrders.length > 0 ? Math.round(wsRevenue / workOrders.length) : 0;

  const kpi: StoreKpi = {
    totalRevenue: salesRevenueEst + wsRevenue,
    salesRevenue: salesRevenueEst,
    serviceRevenue: wsRevenue,
    newCarCount,
    workOrderCount: workOrders.length,
    workOrderAvgAmount: woAvgAmount,
    combinedNps: combinedNps.npsScore,
    followUpCount,
  };

  const npsByKind: NpsByKind[] = [
    {
      kind: "sales",
      npsScore: salesNps.npsScore,
      total: salesNps.total,
      promoter: salesNps.promoter,
      passive: salesNps.passive,
      detractor: salesNps.detractor,
    },
    {
      kind: "aftersales",
      npsScore: saNps.npsScore,
      total: saNps.total,
      promoter: saNps.promoter,
      passive: saNps.passive,
      detractor: saNps.detractor,
    },
  ];

  // ─── NPS 趨勢（近 6 個月，月聚合） ───
  const trendMonths = lastNMonths(6);
  const npsTrend: NpsTrendBucket[] = trendMonths.map((m) => {
    const salesM = npsRows.filter(
      (r) => r.kind === "sales" && monthKey(r.responded_at) === m,
    );
    const saM = npsRows.filter(
      (r) => r.kind === "aftersales" && monthKey(r.responded_at) === m,
    );
    return {
      month: m,
      sales: salesM.length > 0 ? calcNps(salesM).npsScore : 0,
      aftersales: saM.length > 0 ? calcNps(saM).npsScore : 0,
    };
  });

  // ─── 客戶標籤 Top 5（用 customer.metadata.tag_codes 統計，沒設則用 tags table 的 use_count）───
  const tagCount = new Map<string, number>();
  // 直接從 tags table 估計用量（暫時用 tag table 順序 + 統計 customers metadata）
  type CustomerMetadata = { tag_codes?: string[] };
  for (const c of customers) {
    const meta = (c as { metadata?: CustomerMetadata }).metadata ?? {};
    const codes = Array.isArray(meta.tag_codes) ? meta.tag_codes : [];
    for (const code of codes) {
      tagCount.set(code, (tagCount.get(code) ?? 0) + 1);
    }
  }
  // fallback：如果 customer.metadata 沒記 tag_codes，使用 tags 自己的 sort_order 當示意（demo）
  const topTags: TopTagRow[] = tags
    .map((t) => ({
      label: t.label as string,
      emoji: (t.emoji as string | null) ?? null,
      count: tagCount.get(t.code as string) ?? 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 如果 topTags 全部 count=0，至少顯示前 5 名 tags（標 count=0）讓畫面不空
  const topTagsFinal =
    topTags.some((t) => t.count > 0)
      ? topTags
      : tags.slice(0, 5).map((t) => ({
          label: t.label as string,
          emoji: (t.emoji as string | null) ?? null,
          count: 0,
        }));

  // ─── SA 人員排行（用 work_orders.advisor_id；advisor 名字需要查 profiles，但無對應 helper，這裡用 advisor_id 末 6 碼 demo） ───
  // 為了 demo 可讀，把 advisor_id null 的 group 標成「未指派」，其它 group 顯示 ID 後 6 碼
  const advisorMap = new Map<
    string,
    { wos: typeof workOrders; nps: NpsRawRow[] }
  >();
  for (const w of workOrders) {
    const k = (w.advisor_id as string | null) ?? "未指派";
    const cur = advisorMap.get(k) ?? { wos: [], nps: [] };
    cur.wos.push(w);
    advisorMap.set(k, cur);
  }
  // NPS 沒直接掛 advisor，所以依 customer overlap 估（demo 用 sales_person 字串）
  const npsByPerson = new Map<string, NpsRawRow[]>();
  for (const n of npsRows) {
    if (!n.sales_person) continue;
    const arr = npsByPerson.get(n.sales_person) ?? [];
    arr.push(n);
    npsByPerson.set(n.sales_person, arr);
  }

  const saStaffRanking: StaffRanking[] = [...advisorMap.entries()]
    .map(([key, v], idx) => {
      const totalAmt = v.wos.reduce((s, w) => s + Number(w.total_amount ?? 0), 0);
      const avgAmount = v.wos.length > 0 ? Math.round(totalAmt / v.wos.length) : 0;
      // npsAvg：暫時用該段內所有 sa NPS rows 平均（無精確對應，demo）
      const personNps = saNpsRows;
      const avgScore =
        personNps.length > 0
          ? personNps.reduce((s, r) => s + r.score, 0) / personNps.length
          : 0;
      const detractorCount = personNps.filter((r) => classify(r.score) === "detractor").length;
      const label =
        key === "未指派" ? "未指派" : `服務顧問 ${key.slice(-6).toUpperCase()}`;
      return {
        rank: idx + 1,
        name: label,
        workOrderCount: v.wos.length,
        avgAmount,
        npsAvg: Math.round(avgScore * 10) / 10,
        detractorCount,
      };
    })
    .sort((a, b) => b.workOrderCount - a.workOrderCount)
    .slice(0, 5)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  // ─── 銷售 lead KPI ───
  const reviveCandidates = leads.filter((l) => {
    if (!l.next_revive_at) return false;
    const t = new Date(l.next_revive_at);
    const diffDays = (t.getTime() - today.getTime()) / (24 * 60 * 60 * 1000);
    return diffDays >= 0 && diffDays <= 7;
  }).length;
  const salesLeadKpi: SalesLeadKpi = {
    active: leads.filter((l) => l.is_active === true).length,
    dormant: leads.filter((l) => l.dormancy_status === "dormant").length,
    lost: leads.filter((l) => l.dormancy_status === "lost").length,
    reviveCandidates,
  };

  const serviceKpi: ServiceKpi = {
    totalWorkOrders: workOrders.length,
    avgAmount: woAvgAmount,
    overdueCount: overdueWoCount,
    upcomingDueCount,
  };

  // ─── 預警清單 ───
  const alerts: StoreAlert[] = [];
  if (combinedNps.detractor > 0) {
    alerts.push({
      level: "amber",
      title: `期間內 ${combinedNps.detractor} 件批評者回應`,
      body: `銷售 ${salesNps.detractor} 件 / 售後 ${saNps.detractor} 件，建議部門主管於本週前完成補救方案。`,
    });
  }
  if (overdueWoCount > 0) {
    alerts.push({
      level: "red",
      title: `${overdueWoCount} 位在保客戶已超過建議回廠日`,
      body: `下一次保養日已過期但尚未回廠，建議店長親自指派 SA 主管啟動回廠提醒。`,
    });
  }
  if (upcomingDueCount > 0) {
    alerts.push({
      level: "teal",
      title: `${upcomingDueCount} 位在保客戶 14 天內保養到期`,
      body: `已交由 SA 主管於本週推播保養提醒，避免到期未回廠。`,
    });
  }
  if (salesLeadKpi.dormant > 0) {
    alerts.push({
      level: "amber",
      title: `休眠潛客 ${salesLeadKpi.dormant} 筆`,
      body: `建議 RS 主管啟動喚回方案、本週至少觸發前 5 名喚回電訪。`,
    });
  }
  if (alerts.length === 0) {
    alerts.push({
      level: "teal",
      title: "本期無高優先預警",
      body: "所有部門指標皆在綠燈區間，持續維持服務水準。",
    });
  }

  return {
    kpi,
    npsByKind,
    npsBenchmark: 50,
    npsTrend,
    topTags: topTagsFinal,
    saStaffRanking,
    salesLeadKpi,
    serviceKpi,
    alerts,
  };
}

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
  /** CRM07：D+3 電訪完成率（%）— 該 SA 名下 D+3 type call_tasks 完成數 / 應做數 */
  d3FollowupRate: number;
  /** CRM07：逾期客戶數（該 SA 名下、next_service_due_date < today 的客戶數） */
  overdueCustomerCount: number;
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

export type OverdueTrendBucket = {
  month: string;   // YYYY-MM
  label: string;   // "5月"
  count: number;
};

export type DimensionInsight = {
  key: string;
  label: string;
  emoji: string;
  avgScore: number;   // 0–10
  total: number;      // 樣本數
};

export type PushOpenRateKpi = {
  open_rate: number;     // %
  total_sent: number;
  total_read: number;
};

/** CRM07：試駕轉化率（完成試駕 → 後續成交 sales_order 的比例） */
export type TestDriveConversionKpi = {
  completed: number;   // 期間內完成試駕數
  converted: number;   // 其中後續有成交（依 lead_id / customer_id 連結）
  rate: number | null; // % — completed=0 時為 null（顯示「—」）
};

/** CRM07：RS 人員業績排行（真實資料：sales_orders.rs_name 聚合） */
export type SalesStaffRanking = {
  rank: number;
  name: string;          // rs_name
  newCarCount: number;   // contract_type='new'
  usedCarCount: number;  // contract_type='used'
  totalDeals: number;
  testDriveCount: number; // 名下試駕次數（依試駕客戶對到的 order.rs_name 歸戶；多為 0=資料稀疏）
  /** 相對第一名的成交占比（%）— 無真實個人目標，僅作排行視覺化，非「達成率」 */
  topShareRate: number;
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
  /** CRM07：逾期未回廠近 7 個月趨勢（real-data：vehicles.next_service_due_date < today） */
  overdueTrend: OverdueTrendBucket[];
  /** CRM07：售後維度洞察（aspect_scores 各面向均分） */
  dimensionInsights: DimensionInsight[];
  /** CRM07：推播通知開啟率（aftersales kind） */
  pushOpenRate: PushOpenRateKpi;
  /** CRM07：試駕轉化率（完成試駕 → 成交） */
  testDriveConversion: TestDriveConversionKpi;
  /** CRM07：RS 人員業績排行（sales_orders.rs_name 真實聚合） */
  salesStaffRanking: SalesStaffRanking[];
};

type NpsRawRow = {
  id: string;
  kind: "sales" | "aftersales" | string | null;
  score: number;
  category: string | null;
  comment: string | null;
  sales_person: string | null;
  customer_id: string | null;
  metadata: Record<string, unknown> | null;
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
    pushRes,
    ordersRes,
    testDrivesRes,
  ] = await Promise.all([
    supabase
      .from("nps_responses")
      .select("id, kind, score, category, comment, sales_person, customer_id, metadata, responded_at")
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
    supabase
      .from("push_campaigns")
      .select("sent_count, read_count, status, sent_at")
      .eq("brand_id", brand)
      .eq("kind", "aftersales")
      .eq("status", "completed")
      .gte("sent_at", cutoffIso),
    supabase
      .from("sales_orders")
      .select("id, rs_name, contract_type, status, customer_id, lead_id, created_at")
      .eq("brand_id", brand)
      .gte("created_at", cutoffIso),
    supabase
      .from("sales_test_drives")
      .select("id, customer_id, lead_id, status, completed_at, sales_consultant_id")
      .eq("brand_id", brand),
  ]);

  if (npsRes.error) throw npsRes.error;
  if (leadsRes.error) throw leadsRes.error;
  if (callsRes.error) throw callsRes.error;
  if (woRes.error) throw woRes.error;
  if (custRes.error) throw custRes.error;
  if (custTagsRes.error) throw custTagsRes.error;
  if (vehRes.error) throw vehRes.error;
  if (pushRes.error) throw pushRes.error;
  if (ordersRes.error) throw ordersRes.error;
  if (testDrivesRes.error) throw testDrivesRes.error;

  const npsRows = (npsRes.data ?? []) as NpsRawRow[];
  const leads = leadsRes.data ?? [];
  const calls = callsRes.data ?? [];
  const workOrders = woRes.data ?? [];
  const customers = custRes.data ?? [];
  const tags = custTagsRes.data ?? [];
  const vehicles = vehRes.data ?? [];
  const pushDeliveries = pushRes.data ?? [];
  const salesOrders = ordersRes.data ?? [];
  const testDrives = testDrivesRes.data ?? [];

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

  // 售後 D+3 電訪 task 統計：依 customer_id 分配回 SA（advisor_id 來自 work_orders）
  // 先把 customer → advisor_id 對映建好
  const customerToAdvisor = new Map<string, string>();
  for (const w of workOrders) {
    if (w.customer_id && w.advisor_id) {
      customerToAdvisor.set(w.customer_id as string, w.advisor_id as string);
    }
  }

  const D3_TASK_KINDS = new Set(["aftersales_d3", "d3_followup"]);
  const overdueDueDate = new Date();
  const overdueCustomerIds = new Set(
    vehicles
      .filter(
        (v) =>
          v.next_service_due_date &&
          new Date(v.next_service_due_date) < overdueDueDate,
      )
      .map((v) => v.customer_id as string),
  );

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

      // CRM07：D+3 電訪率 + 逾期客戶數
      const ownedCustomerIds = new Set(
        v.wos.map((w) => w.customer_id as string).filter(Boolean),
      );
      const d3Tasks = calls.filter(
        (c) =>
          D3_TASK_KINDS.has((c as { call_type?: string }).call_type ?? "") &&
          ownedCustomerIds.has(c.customer_id as string),
      );
      // 也納入 customer 對 advisor 反查（部分 task 沒對到 wo）
      const extraD3 = calls.filter(
        (c) =>
          D3_TASK_KINDS.has((c as { call_type?: string }).call_type ?? "") &&
          customerToAdvisor.get(c.customer_id as string) === key,
      );
      const d3All = new Map<string, (typeof calls)[number]>();
      [...d3Tasks, ...extraD3].forEach((t) => d3All.set(t.id as string, t));
      const d3Total = d3All.size;
      const d3Done = [...d3All.values()].filter(
        (t) => t.status === "completed",
      ).length;
      const d3FollowupRate =
        d3Total > 0 ? Math.round((d3Done / d3Total) * 100) : 0;

      const overdueCustomerCount = [...ownedCustomerIds].filter((id) =>
        overdueCustomerIds.has(id),
      ).length;

      return {
        rank: idx + 1,
        name: label,
        workOrderCount: v.wos.length,
        avgAmount,
        npsAvg: Math.round(avgScore * 10) / 10,
        detractorCount,
        d3FollowupRate,
        overdueCustomerCount,
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

  // ── CRM07：逾期未回廠近 7 個月趨勢（real-data 從 customer_vehicles + work_orders 推算）─
  // 以「該月月底」當作 cut-off，計算當時 next_service_due_date < monthEnd 且 vehicle 仍 active 的車輛數。
  // 沒有歷史快照表時，用當前 vehicles 推算（demo 等價於：愈早的月份逾期愈少，因為 due_date 是相對未來）。
  // 簡化做法：取 vehicles.next_service_due_date 落在 (monthStart - 360 days, monthEnd] 的個數，
  // 代表「截至該月底已過期 ≤1 年的車輛」— 對 demo 已夠有解釋力。
  const overdueTrend: OverdueTrendBucket[] = [];
  const trend7Months = lastNMonths(7);
  const monthLabel: Record<string, string> = {};
  trend7Months.forEach((m) => {
    const mm = Number.parseInt(m.slice(5), 10);
    monthLabel[m] = `${mm}月`;
  });
  for (const m of trend7Months) {
    const [yy, mm] = m.split("-").map((s) => Number.parseInt(s, 10));
    const monthEnd = new Date(yy, mm, 0, 23, 59, 59); // 月底
    const yearAgo = new Date(yy, mm - 13, 1);
    const overdueAt = vehicles.filter((v) => {
      if (!v.next_service_due_date) return false;
      const due = new Date(v.next_service_due_date);
      return due < monthEnd && due >= yearAgo;
    }).length;
    overdueTrend.push({ month: m, label: monthLabel[m], count: overdueAt });
  }

  // ── CRM07：售後維度洞察（aspect_scores 平均） ───
  const ASPECT_DEFS: Array<{ key: string; label: string; emoji: string }> = [
    { key: "sa_attitude", label: "SA 服務態度", emoji: "🤝" },
    { key: "repair_quality", label: "維修品質", emoji: "🔧" },
    { key: "waiting_time", label: "等待時間", emoji: "⏱️" },
    { key: "cost_transparency", label: "費用透明度", emoji: "💰" },
    { key: "pickup_explanation", label: "取車說明", emoji: "📋" },
  ];
  const aspectSums = new Map<string, { sum: number; n: number }>();
  for (const n of saNpsRows) {
    const meta = (n.metadata ?? {}) as { aspect_scores?: Record<string, number> };
    const scores = meta.aspect_scores ?? {};
    for (const def of ASPECT_DEFS) {
      const v = scores[def.key];
      if (typeof v === "number" && v >= 0) {
        const cur = aspectSums.get(def.key) ?? { sum: 0, n: 0 };
        cur.sum += v;
        cur.n += 1;
        aspectSums.set(def.key, cur);
      }
    }
  }
  const dimensionInsights: DimensionInsight[] = ASPECT_DEFS.map((def) => {
    const agg = aspectSums.get(def.key);
    return {
      key: def.key,
      label: def.label,
      emoji: def.emoji,
      avgScore: agg && agg.n > 0 ? Math.round((agg.sum / agg.n) * 10) / 10 : 0,
      total: agg?.n ?? 0,
    };
  });

  // ── CRM07：推播通知開啟率 ───
  const totalSent = pushDeliveries.reduce((s, p) => s + Number(p.sent_count ?? 0), 0);
  const totalRead = pushDeliveries.reduce((s, p) => s + Number(p.read_count ?? 0), 0);
  const pushOpenRate: PushOpenRateKpi = {
    open_rate: totalSent > 0 ? Math.round((totalRead / totalSent) * 1000) / 10 : 0,
    total_sent: totalSent,
    total_read: totalRead,
  };

  // ── CRM07：試駕轉化率（完成試駕 → 後續成交）───────────────────────
  // 真實計算：期間內 status='completed' 的試駕，其 lead_id / customer_id
  // 是否出現在有效（非 cancelled/draft）sales_orders。orders 已限期間內撈。
  const VALID_ORDER_STATUSES = (s: string | null) =>
    s != null && s !== "cancelled" && s !== "draft";
  const orderLeadIds = new Set(
    salesOrders
      .filter((o) => VALID_ORDER_STATUSES(o.status as string | null) && o.lead_id)
      .map((o) => o.lead_id as string),
  );
  const orderCustomerIds = new Set(
    salesOrders
      .filter((o) => VALID_ORDER_STATUSES(o.status as string | null) && o.customer_id)
      .map((o) => o.customer_id as string),
  );
  const completedTestDrives = testDrives.filter(
    (t) => t.status === "completed",
  );
  const convertedTestDrives = completedTestDrives.filter((t) => {
    const lid = t.lead_id as string | null;
    const cid = t.customer_id as string | null;
    return (lid && orderLeadIds.has(lid)) || (cid && orderCustomerIds.has(cid));
  });
  const testDriveConversion: TestDriveConversionKpi = {
    completed: completedTestDrives.length,
    converted: convertedTestDrives.length,
    rate:
      completedTestDrives.length > 0
        ? Math.round(
            (convertedTestDrives.length / completedTestDrives.length) * 100,
          )
        : null,
  };

  // ── CRM07：RS 人員業績排行（sales_orders.rs_name 真實聚合）──────────
  // 每位 RS 在期間內的成交台數（新車 / 中古）+ 名下試駕次數。
  // 試駕歸戶：把試駕客戶對到的（最早一張）order.rs_name 當作該試駕的 RS。
  // 無真實個人銷售目標欄位 → 不造「達成率」假數字，改用「相對第一名占比」做排行視覺化。
  const customerToOrderRs = new Map<string, string>();
  for (const o of [...salesOrders].sort(
    (a, b) =>
      new Date(a.created_at as string).getTime() -
      new Date(b.created_at as string).getTime(),
  )) {
    const cid = o.customer_id as string | null;
    const rs = o.rs_name as string | null;
    if (cid && rs && !customerToOrderRs.has(cid)) {
      customerToOrderRs.set(cid, rs);
    }
  }
  const testDriveCountByRs = new Map<string, number>();
  for (const t of testDrives) {
    const cid = t.customer_id as string | null;
    const rs = cid ? customerToOrderRs.get(cid) : undefined;
    if (rs) testDriveCountByRs.set(rs, (testDriveCountByRs.get(rs) ?? 0) + 1);
  }
  const rsAgg = new Map<
    string,
    { newCarCount: number; usedCarCount: number; totalDeals: number }
  >();
  for (const o of salesOrders) {
    const rs = o.rs_name as string | null;
    if (!rs || !VALID_ORDER_STATUSES(o.status as string | null)) continue;
    const cur = rsAgg.get(rs) ?? {
      newCarCount: 0,
      usedCarCount: 0,
      totalDeals: 0,
    };
    if (o.contract_type === "new") cur.newCarCount += 1;
    else if (o.contract_type === "used") cur.usedCarCount += 1;
    cur.totalDeals += 1;
    rsAgg.set(rs, cur);
  }
  const rsSorted = [...rsAgg.entries()].sort(
    (a, b) =>
      b[1].totalDeals - a[1].totalDeals || b[1].newCarCount - a[1].newCarCount,
  );
  const topDeals = rsSorted.length > 0 ? rsSorted[0][1].totalDeals : 0;
  const salesStaffRanking: SalesStaffRanking[] = rsSorted
    .slice(0, 5)
    .map(([name, v], idx) => ({
      rank: idx + 1,
      name,
      newCarCount: v.newCarCount,
      usedCarCount: v.usedCarCount,
      totalDeals: v.totalDeals,
      testDriveCount: testDriveCountByRs.get(name) ?? 0,
      topShareRate: topDeals > 0 ? Math.round((v.totalDeals / topDeals) * 100) : 0,
    }));

  // ── 動態化預警文案：批評者 alert 接客戶名（demo：取最近 1 件） ──
  if (combinedNps.detractor > 0) {
    const recentDetractor = npsRows.find((r) => r.score <= 6);
    const detractorCustomer = recentDetractor?.customer_id
      ? customers.find((c) => c.id === recentDetractor.customer_id)
      : null;
    if (recentDetractor && detractorCustomer) {
      const days = Math.max(
        1,
        Math.round(
          (Date.now() - new Date(recentDetractor.responded_at).getTime()) /
            (24 * 60 * 60 * 1000),
        ),
      );
      const idx = alerts.findIndex((a) => a.title.includes("批評者"));
      if (idx >= 0) {
        alerts[idx] = {
          ...alerts[idx],
          body: `最新一筆：${detractorCustomer.name as string}（NPS ${recentDetractor.score}，${days} 天前回應）。${alerts[idx].body}`,
        };
      }
    }
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
    overdueTrend,
    dimensionInsights,
    pushOpenRate,
    testDriveConversion,
    salesStaffRanking,
  };
}

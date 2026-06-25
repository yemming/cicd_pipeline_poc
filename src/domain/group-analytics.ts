"use server";

/**
 * Domain Helper — Group Analytics（集團管理 · 個人能效散佈圖）
 *
 * 第十六輪 Phase 1 地基。GRP07（銷售顧問能效）+ GRP08（SA 能效診斷）兩支
 * 散佈圖頁的唯一資料來源。
 *
 * ── POC 策略（建議書 §11.2、round-16 proposal §三）──
 * 「能從真實交易表即時算的就算（3 個月滾動），算不出的細粒度指標
 *   從 kpi_snapshots 讀（demo seed 會塞）」。
 *
 * 本 helper 內部把兩種來源依 staff_id 合併成 per-staff 一筆：
 *   1. 即時計算 metrics — GROUP BY 撈 sales_orders / sales_leads /
 *      repair_orders / vehicle_models，3 個月滾動窗。
 *   2. seeded metrics — kpi_snapshots（metric_key → value）依 staff_id + 最新
 *      period_month 取回，補上即時算不出的細粒度指標（個人 NPS / GP3 /
 *      衍生毛利 / 增項率 / 毛利率 / 返修率）。
 *
 * ── 真實表 / 欄位映射（schema-checked 2026-05-29）──
 *   • 銷售顧問身分：employees.role_codes && {sales_consultant, rs_manager}
 *     → 與 sales_orders.rs_name / sales_leads.rs_name 以「姓名（text）」串。
 *       ⚠️ 這兩張表沒有 staff FK，只有 rs_name 文字欄。
 *   • SA 身分：employees.role_codes && {sa}
 *     → 與 repair_orders.sa_id（真 FK→employees.id）串（143/143 命中）。
 *   • 接待量：sales_leads（per rs_name 計數）。
 *   • 成交：sales_orders status in (signed, fulfilled) 計數 + total_amount。
 *   • 單車 GP：sales_orders.total_amount − vehicle_models.standard_cost。
 *   • 接車台次/產值：repair_orders（per sa_id）count + lines_total。
 *   • 個人 NPS：nps_responses.sales_person 是 text 且 demo 名單與 orders 不一致
 *     → 無法可靠 join，走 kpi_snapshots seed。
 *
 * 紀律：server-only domain helper，內部自己 import supabase（天條只禁 UI 直連）。
 *       RLS 靠 user_has_brand(brand_id) 把跨 brand 擋掉；brandId 參數僅作 query filter。
 */

import { createClient } from "@/lib/supabase/server";
import {
  HEALTH_DIM_LABEL,
  type HealthDim,
  type DimDef,
  FUNNEL_STAGES,
  SOURCE_BUCKETS,
  CUST_STATES,
  LOST_REASONS,
  CHURN_RISK_DAYS,
  PARTS_CATEGORIES,
  PARTS_DEADSTOCK_WARN,
  PARTS_TURNOVER_TARGET,
} from "./group-analytics-labels";

/* ────────────── 共用型別 ────────────── */

/** 散佈圖診斷分類（caller 也可重算；helper 給簡單門檻版） */
export type EfficiencyTag = "star" | "watch" | "danger" | "neutral";

export type ScatterOptions = {
  /** 只看某門店（org_id）；不給=全 brand。目前依員工 dept 解析，POC 寬鬆比對 */
  orgId?: string;
  /** 滾動窗月數，預設 3（建議書 §11.2 三個月滾動） */
  rollingMonths?: number;
};

/** 來自 kpi_snapshots 的 seed 指標（依 staff_id 取最新 period_month） */
type SeededMetrics = Record<string, number | null>;

/* ── GRP07 銷售顧問能效 per-staff 形狀 ── */
export type SalesEffStaff = {
  staff_id: string;
  name: string;
  store: string | null;
  /** 總接待量（leads count，即時算） */
  reception_count: number;
  /** 成交台次（signed/fulfilled orders count，即時算） */
  deal_count: number;
  /** 成交率 0..1（deal_count / reception_count，即時算；無接待回 null） */
  conversion_rate: number | null;
  /** 單車平均 GP（total_amount − standard_cost，即時算；無成本回 null） */
  avg_gp_per_vehicle: number | null;
  /** 單車 GP3（精算分層毛利，現有 schema 無 → kpi_snapshots seed） */
  avg_gp3: number | null;
  /** 單車衍生毛利（金融/保險/精品，現有 schema 無 → seed） */
  avg_derivative_gp: number | null;
  /** 個人平均 NPS（nps 名單無法 join → seed） */
  avg_nps: number | null;
  tag: EfficiencyTag;
};

/* ── GRP08 SA 能效 per-staff 形狀 ── */
export type SAEffStaff = {
  staff_id: string;
  name: string;
  store: string | null;
  /** 接車台次（repair_orders count，即時算） */
  intake_count: number;
  /** 單車平均產值（lines_total avg，即時算；無回 null） */
  avg_revenue_per_ro: number | null;
  /** 毛利率 0..1（精算需料工成本拆分，現有 schema 不足 → seed） */
  gross_margin_rate: number | null;
  /** 增項率 0..1（addons 太稀疏且 decided_by_sa_id 全空 → seed） */
  addon_rate: number | null;
  /** 增項金額（同上 → seed） */
  addon_amount: number | null;
  /** 個人平均 NPS（→ seed） */
  avg_nps: number | null;
  /** 返修率 0..1（現有 schema 無返修標記 → seed；>0.05 觸發告警橫幅） */
  rework_rate: number | null;
  tag: EfficiencyTag;
};

/* ────────────── 工具 ────────────── */

/** 滾動窗起點：今天往前 N 個月的月初（date 字串 YYYY-MM-DD） */
function rollingWindowStart(months: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  return d.toISOString().slice(0, 10);
}

const SALES_ROLES = ["sales_consultant", "rs_manager"];
const SA_ROLES = ["sa"];

type EmployeeLite = {
  id: string;
  name: string;
  dept_id: string | null;
  role_codes: string[] | null;
};

/** 撈某 brand 在職員工（依角色過濾），回 id/name/dept */
async function listActiveEmployees(
  client: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  roles: string[],
): Promise<EmployeeLite[]> {
  const { data } = await client
    .from("employees")
    .select("id, name, dept_id, role_codes")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .overlaps("role_codes", roles);
  return (data ?? []) as EmployeeLite[];
}

/** dept_id → 部門名稱（當作 store 顯示，POC 近似）；查不到回 null */
async function resolveDeptNames(
  client: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  deptIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(deptIds.filter(Boolean))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await client
    .from("departments")
    .select("id, name")
    .eq("brand_id", brandId)
    .in("id", ids);
  for (const d of (data ?? []) as Array<{ id: string; name: string }>) {
    map.set(d.id, d.name);
  }
  return map;
}

/**
 * 撈 kpi_snapshots 的 seed 指標，依 staff_id 取最新 period_month 的每個 metric_key。
 * 回 Map<staff_id, { metric_key: value }>。
 */
async function loadSeededMetrics(
  client: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  staffRole: string,
  staffIds: string[],
): Promise<Map<string, SeededMetrics>> {
  const result = new Map<string, SeededMetrics>();
  if (staffIds.length === 0) return result;

  // 撈該 role 全部 snapshot row（量小，client 端取每 staff×metric 的最新 period）
  const { data } = await client
    .from("kpi_snapshots")
    .select("staff_id, period_month, metric_key, metric_value")
    .eq("brand_id", brandId)
    .eq("staff_role", staffRole)
    .in("staff_id", staffIds)
    .order("period_month", { ascending: false });

  // 第一次看到 (staff, metric) 即最新（已 desc 排序）
  const seen = new Set<string>();
  for (const row of (data ?? []) as Array<{
    staff_id: string;
    period_month: string;
    metric_key: string;
    metric_value: number | null;
  }>) {
    if (!row.staff_id) continue;
    const dedupKey = `${row.staff_id}::${row.metric_key}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const bucket = result.get(row.staff_id) ?? {};
    bucket[row.metric_key] = row.metric_value;
    result.set(row.staff_id, bucket);
  }
  return result;
}

/** 簡單門檻診斷分類（caller 可覆寫）。兩軸都偏低=danger、都偏高=star，其餘 watch */
function classify(loAxis: number | null, hiAxis: number | null): EfficiencyTag {
  if (loAxis === null || hiAxis === null) return "neutral";
  const lowLo = loAxis < 0.5;
  const lowHi = hiAxis < 0.5;
  if (!lowLo && !lowHi) return "star";
  if (lowLo && lowHi) return "danger";
  return "watch";
}

/* ────────────── GRP07：銷售顧問能效散佈圖 ────────────── */

/**
 * 回傳每位在職銷售顧問一筆，含 S1-S4 散佈圖所需所有軸值。
 * 即時算：reception_count / deal_count / conversion_rate / avg_gp_per_vehicle。
 * seed 補：avg_gp3（gp3）/ avg_derivative_gp（derivative_gp）/ avg_nps（nps）。
 */
export async function getSalesEfficiencyScatter(
  brandId: string,
  opts: ScatterOptions = {},
): Promise<SalesEffStaff[]> {
  const client = await createClient();
  const rollingMonths = opts.rollingMonths ?? 3;
  const since = rollingWindowStart(rollingMonths);

  const employees = await listActiveEmployees(client, brandId, SALES_ROLES);
  if (employees.length === 0) return [];

  const deptNames = await resolveDeptNames(
    client,
    brandId,
    employees.map((e) => e.dept_id ?? ""),
  );
  const seeded = await loadSeededMetrics(
    client,
    brandId,
    "salesperson",
    employees.map((e) => e.id),
  );

  // 即時：leads（接待量）依 rs_name 計數
  const { data: leadRows } = await client
    .from("sales_dormant_leads")
    .select("rs_name")
    .eq("brand_id", brandId)
    .gte("created_at", since);
  const leadCountByName = new Map<string, number>();
  for (const r of (leadRows ?? []) as Array<{ rs_name: string | null }>) {
    if (!r.rs_name) continue;
    leadCountByName.set(r.rs_name, (leadCountByName.get(r.rs_name) ?? 0) + 1);
  }

  // 即時：成交單（signed/fulfilled）依 rs_name 計數 + total_amount + 車款成本
  const { data: orderRows } = await client
    .from("sales_orders")
    .select("rs_name, status, total_amount, vehicle_model_id")
    .eq("brand_id", brandId)
    .in("status", ["signed", "fulfilled"])
    .gte("created_at", since);

  // 撈相關車款成本
  const modelIds = [
    ...new Set(
      (orderRows ?? [])
        .map((o) => (o as { vehicle_model_id: string | null }).vehicle_model_id)
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const costByModel = new Map<string, number>();
  if (modelIds.length > 0) {
    const { data: models } = await client
      .from("vehicle_models")
      .select("id, standard_cost")
      .in("id", modelIds);
    for (const m of (models ?? []) as Array<{ id: string; standard_cost: number | null }>) {
      if (m.standard_cost != null) costByModel.set(m.id, m.standard_cost);
    }
  }

  type DealAgg = { count: number; gpSum: number; gpN: number };
  const dealByName = new Map<string, DealAgg>();
  for (const o of (orderRows ?? []) as Array<{
    rs_name: string | null;
    total_amount: number | null;
    vehicle_model_id: string | null;
  }>) {
    if (!o.rs_name) continue;
    const agg = dealByName.get(o.rs_name) ?? { count: 0, gpSum: 0, gpN: 0 };
    agg.count += 1;
    const cost = o.vehicle_model_id ? costByModel.get(o.vehicle_model_id) : undefined;
    if (o.total_amount != null && cost != null) {
      agg.gpSum += o.total_amount - cost;
      agg.gpN += 1;
    }
    dealByName.set(o.rs_name, agg);
  }

  const out: SalesEffStaff[] = employees.map((e) => {
    const liveReception = leadCountByName.get(e.name) ?? 0;
    const deal = dealByName.get(e.name);
    const liveDealCount = deal?.count ?? 0;
    const liveConversion = liveReception > 0 ? liveDealCount / liveReception : null;
    const avgGp = deal && deal.gpN > 0 ? deal.gpSum / deal.gpN : null;
    const seed = seeded.get(e.id) ?? {};
    // POC「能算就算、算不出 seed」：真實 leads/orders 對得上名字者用即時值；
    // demo 員工（無即時資料）用 kpi_snapshots seed 撐散佈圖位置。
    const reception = seed["reception_count"] ?? liveReception;
    const dealCount = seed["deal_count"] ?? liveDealCount;
    const conversion = seed["conversion_rate"] ?? liveConversion;
    return {
      staff_id: e.id,
      name: e.name,
      store: e.dept_id ? (deptNames.get(e.dept_id) ?? null) : null,
      reception_count: reception,
      deal_count: dealCount,
      conversion_rate: conversion,
      avg_gp_per_vehicle: avgGp,
      avg_gp3: seed["gp3"] ?? null,
      avg_derivative_gp: seed["derivative_gp"] ?? null,
      avg_nps: seed["nps"] ?? null,
      // 簡單診斷：成交率 × （GP3 或單車 GP normalize 不易，這裡用成交率 vs 接待量門檻）
      tag: classify(
        conversion,
        // 高接待量(>10)視為 hi 軸達標，normalize 成 0/1 區間給 classify 用
        reception > 0 ? Math.min(reception / 10, 1) : null,
      ),
    };
  });

  return out;
}

/* ────────────── GRP08：SA 能效診斷散佈圖 ────────────── */

/**
 * 回傳每位在職 SA 一筆，含 A1-A4 散佈圖所需軸值 + 返修率（告警橫幅用）。
 * 即時算：intake_count / avg_revenue_per_ro。
 * seed 補：gross_margin_rate（gross_margin_rate）/ addon_rate（addon_rate）/
 *          addon_amount（addon_amount）/ avg_nps（nps）/ rework_rate（rework_rate）。
 */
export async function getSAEfficiencyScatter(
  brandId: string,
  opts: ScatterOptions = {},
): Promise<SAEffStaff[]> {
  const client = await createClient();
  const rollingMonths = opts.rollingMonths ?? 3;
  const since = rollingWindowStart(rollingMonths);

  const employees = await listActiveEmployees(client, brandId, SA_ROLES);
  if (employees.length === 0) return [];

  const deptNames = await resolveDeptNames(
    client,
    brandId,
    employees.map((e) => e.dept_id ?? ""),
  );
  const seeded = await loadSeededMetrics(
    client,
    brandId,
    "sa",
    employees.map((e) => e.id),
  );

  // 即時：repair_orders 依 sa_id 聚合（接車台次 + 單車產值 lines_total）
  const { data: roRows } = await client
    .from("repair_orders")
    .select("sa_id, lines_total, opened_at")
    .eq("brand_id", brandId)
    .gte("opened_at", since);

  type RoAgg = { count: number; revSum: number; revN: number };
  const roBySa = new Map<string, RoAgg>();
  for (const r of (roRows ?? []) as Array<{
    sa_id: string | null;
    lines_total: number | null;
  }>) {
    if (!r.sa_id) continue;
    const agg = roBySa.get(r.sa_id) ?? { count: 0, revSum: 0, revN: 0 };
    agg.count += 1;
    if (r.lines_total != null) {
      agg.revSum += r.lines_total;
      agg.revN += 1;
    }
    roBySa.set(r.sa_id, agg);
  }

  const out: SAEffStaff[] = employees.map((e) => {
    const ro = roBySa.get(e.id);
    const liveIntake = ro?.count ?? 0;
    const liveAvgRev = ro && ro.revN > 0 ? ro.revSum / ro.revN : null;
    const seed = seeded.get(e.id) ?? {};
    const margin = seed["gross_margin_rate"] ?? null;
    // POC：repair_orders.sa_id 是真 FK，有單者用即時值；demo SA（無單）用 seed 撐位置。
    const intake = seed["intake_count"] ?? liveIntake;
    const avgRev = seed["avg_revenue_per_ro"] ?? liveAvgRev;
    return {
      staff_id: e.id,
      name: e.name,
      store: e.dept_id ? (deptNames.get(e.dept_id) ?? null) : null,
      intake_count: intake,
      avg_revenue_per_ro: avgRev,
      gross_margin_rate: margin,
      addon_rate: seed["addon_rate"] ?? null,
      addon_amount: seed["addon_amount"] ?? null,
      avg_nps: seed["nps"] ?? null,
      rework_rate: seed["rework_rate"] ?? null,
      // 診斷：接車台次(normalize /20) × 毛利率
      tag: classify(margin, intake > 0 ? Math.min(intake / 20, 1) : null),
    };
  });

  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
 *  第十七輪 — 門店診斷層（GRP09 / GRP10 / GRP11）append（不改既有 export）
 *
 *  資料策略沿用 round-16：能算就算、算不出讀 seed。本層 metric 多為門店層／衍生
 *  指標，現有交易表無法可靠拆分 → 一律讀 kpi_snapshots（org_id=門店、staff_id NULL）
 *  與 org_benchmarks（scope='national'）。下面每個 function 的 JSDoc 都精確列出它讀
 *  哪些 metric_key（即「資料合約」，主 agent 照此 seed）。
 *
 *  全部對「無資料」安全：回空陣列 / null，不 throw。
 * ════════════════════════════════════════════════════════════════════════ */

/* ────────────── 共用型別（門店診斷層） ────────────── */

/** 趨勢方向（KPI 卡角標用）。 */
export type TrendDir = "up" | "down" | "flat";

/** 門店切換器選項（GRP09/10/11 共用）。 */
export type StoreLite = {
  id: string;
  name: string;
  short_name: string | null;
};

/** 一張 KPI 卡的標準形狀（值 + 可選目標/達成率/趨勢）。 */
export type DiagKpi = {
  /** 主數值；算不出回 null（UI 顯示「—」） */
  value: number | null;
  /** 目標值（可選） */
  target?: number | null;
  /** 達成率 0..1（可選；通常 value/target） */
  rate?: number | null;
  /** 趨勢方向（vs 上期，可選） */
  trend?: TrendDir | null;
};

/** 銷售漏斗一階段。 */
export type FunnelStage = {
  stage: string;
  count: number;
  /** 相對「上一階段」的轉換率 0..1（首階段為 null） */
  rate: number | null;
};

/** 衍生滲透率（各品項滲透率 0..1 + 對應集團均值）。 */
export type DerivativePenetration = {
  finance: number | null;
  insurance: number | null;
  extwarranty: number | null;
  accessory: number | null;
  /** 集團均值（national benchmark） */
  national: {
    finance: number | null;
    insurance: number | null;
    extwarranty: number | null;
    accessory: number | null;
  };
};

/** GRP09 門店銷售診斷回傳。 */
export type StoreSalesDiagnostics = {
  store: StoreLite;
  period: string; // YYYY-MM-01
  kpis: {
    /** 本月銷量（台）+ 目標 + 達成率 + 趨勢 */
    sales_volume: DiagKpi;
    /** 成交率 0..1 */
    conversion_rate: DiagKpi;
    /** 單車 GP3（精算分層毛利，元） */
    gp3_per_vehicle: DiagKpi;
    /** 單車衍生毛利（元） */
    derivative_gp_per_vehicle: DiagKpi;
  };
  /** 集團均值對標 */
  benchmark: {
    conversion_rate: number | null;
    gp3_per_vehicle: number | null;
  };
  /** 銷售漏斗 5 階段 */
  funnel: FunnelStage[];
  /** 衍生滲透率（含集團均值） */
  derivative: DerivativePenetration;
  /** 批售佔比 0..1 */
  wholesale_ratio: number | null;
  /** 自動診斷文字 */
  diagnostics: string[];
};

/** 車間三率。 */
export type WorkshopRates = {
  efficiency: number | null;
  utilization: number | null;
  productivity: number | null;
};

/** 業務結構一類。 */
export type ServiceTypeBucket = {
  type: string;
  count: number;
};

/** 零件庫存健康。 */
export type PartsInventoryHealth = {
  fulfill_rate: number | null;
  turnover: number | null;
  deadstock_pct: number | null;
  direct_sale_amt: number | null;
  direct_sale_margin: number | null;
};

/** 精品加裝。 */
export type AccessoryInstall = {
  install_rate: number | null;
  margin: number | null;
};

/** 客戶流動一月。 */
export type CustomerFlowPoint = {
  month: string; // YYYY-MM-01
  new: number;
  lost: number;
  net: number;
};

/** GRP10 門店售後診斷回傳。 */
export type StoreServiceDiagnostics = {
  store: StoreLite;
  period: string;
  kpis: {
    /** 維修台次 + 目標 + 達成率 + 趨勢 */
    service_count: DiagKpi;
    /** 單車產值（元） */
    revenue_per_vehicle: DiagKpi;
    /** 主營毛利率 0..1 */
    gross_margin_rate: DiagKpi;
    /** 售後吸收率 0..1 */
    absorption_rate: DiagKpi;
    /** 返修率 0..1（>0.05 觸發告警橫幅） */
    rework_rate: DiagKpi;
  };
  benchmark: {
    revenue_per_vehicle: number | null;
    gross_margin_rate: number | null;
    absorption_rate: number | null;
  };
  /** 車間三率 */
  workshop: WorkshopRates;
  /** 業務結構（保養/維修/鈑噴/其他…） */
  serviceMix: ServiceTypeBucket[];
  /** 零件庫存健康 */
  parts: PartsInventoryHealth;
  /** 精品加裝 */
  accessory: AccessoryInstall;
  /** 客戶流動近 5 月 */
  customerFlow: CustomerFlowPoint[];
  /** 自動診斷文字 */
  diagnostics: string[];
};

/** GRP11 跨部門能效 per-staff（銷售 + 售後 union）。 */
export type CrossDeptStaff = {
  staff_id: string;
  name: string;
  store: string | null;
  /** 部門別（圓=銷售 / 菱=售後） */
  dept: "sales" | "service";
  /** 量：銷售=deal_count、售後=intake_count */
  volume: number;
  /** 個人 NPS（seed） */
  nps: number | null;
  /** 名下客戶總數（seed 新 metric cust_total） */
  cust_total: number | null;
  /** 流失客戶數（seed 新 metric churn_count） */
  churn_count: number | null;
  /** 流失率 0..1（churn_count / cust_total，算不出回 null） */
  churn_rate: number | null;
  /** 趨勢方向（vs 上期，目前以 seed 缺省 null；保留欄位） */
  trend: TrendDir | null;
  /** 風險分類（流失率高=danger、NPS 高且流失低=star，其餘 watch/neutral） */
  risk: EfficiencyTag;
};

/* ────────────── 門店層 seed 撈取工具 ────────────── */

/**
 * 撈某門店在某 period 的 kpi_snapshots 門店層 metric（org_id=門店、staff_id IS NULL）。
 * 回 Map<metric_key, value>。period 不給=取最新一期。
 */
async function loadStoreMetrics(
  client: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  orgId: string,
  period?: string,
): Promise<{ period: string | null; metrics: Map<string, number | null> }> {
  let query = client
    .from("kpi_snapshots")
    .select("period_month, metric_key, metric_value")
    .eq("brand_id", brandId)
    .eq("org_id", orgId)
    .is("staff_id", null);
  if (period) {
    query = query.eq("period_month", period);
  }
  const { data } = await query.order("period_month", { ascending: false });

  const rows = (data ?? []) as Array<{
    period_month: string;
    metric_key: string;
    metric_value: number | null;
  }>;
  if (rows.length === 0) return { period: period ?? null, metrics: new Map() };

  // 未指定 period → 鎖定最新一期，只取該期的 metric
  const targetPeriod = period ?? rows[0].period_month;
  const metrics = new Map<string, number | null>();
  for (const r of rows) {
    if (r.period_month !== targetPeriod) continue;
    if (!metrics.has(r.metric_key)) metrics.set(r.metric_key, r.metric_value);
  }
  return { period: targetPeriod, metrics };
}

/**
 * 撈集團均值 benchmark（scope='national'）。回 Map<metric_key, value>。
 * 取每個 metric_key 最新 period（period_month 可為 NULL = 無期別常數）。
 */
async function loadNationalBenchmarks(
  client: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
): Promise<Map<string, number | null>> {
  const { data } = await client
    .from("org_benchmarks")
    .select("metric_key, metric_value, period_month")
    .eq("brand_id", brandId)
    .eq("scope", "national")
    .order("period_month", { ascending: false, nullsFirst: false });
  const map = new Map<string, number | null>();
  for (const r of (data ?? []) as Array<{
    metric_key: string;
    metric_value: number | null;
  }>) {
    if (!map.has(r.metric_key)) map.set(r.metric_key, r.metric_value);
  }
  return map;
}

/** Map 取值短手；缺鍵回 null。 */
function m(map: Map<string, number | null>, key: string): number | null {
  return map.has(key) ? (map.get(key) ?? null) : null;
}

/** value/target → rate（target 為 0/null 回 null）。 */
function ratio(value: number | null, target: number | null): number | null {
  if (value == null || target == null || target === 0) return null;
  return value / target;
}

/** seed 的 trend metric（數字編碼）→ TrendDir。1=up / -1=down / 0=flat。 */
function trendOf(v: number | null): TrendDir | null {
  if (v == null) return null;
  if (v > 0) return "up";
  if (v < 0) return "down";
  return "flat";
}

/* ────────────── (1) listDiagnosticStores ────────────── */

/**
 * 撈某 brand level=2、is_active 的門店（含 round-17 demo 門店），驅動三頁切換器。
 * 不讀 kpi_snapshots，純 organizations。無資料回空陣列。
 */
export async function listDiagnosticStores(brandId: string): Promise<StoreLite[]> {
  const client = await createClient();
  const { data } = await client
    .from("organizations")
    .select("id, name, short_name")
    .eq("brand_id", brandId)
    .eq("level", 2)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  return ((data ?? []) as Array<{ id: string; name: string; short_name: string | null }>).map(
    (o) => ({ id: o.id, name: o.name, short_name: o.short_name }),
  );
}

/* ────────────── (2) getStoreSalesDiagnostics（GRP09） ────────────── */

/**
 * 門店單月銷售體檢。全部 metric 讀 kpi_snapshots 門店層（org_id=門店、staff_id NULL）
 * + org_benchmarks（scope='national'）。
 *
 * 【資料合約 — kpi_snapshots（org_id=門店, staff_id=NULL, staff_role=NULL）metric_key】
 *   sales_volume / sales_volume_target / sales_volume_trend(1|0|-1)
 *   conversion_rate(0..1)
 *   gp3_per_vehicle / gp3_trend(1|0|-1)
 *   derivative_gp_per_vehicle
 *   funnel_lead / funnel_test_ride / funnel_quote / funnel_order / funnel_delivered（5 階段計數）
 *   pen_finance / pen_insurance / pen_extwarranty / pen_accessory（各 0..1）
 *   wholesale_ratio(0..1)
 * 【資料合約 — org_benchmarks（scope='national'）metric_key】
 *   conversion_rate / gp3_per_vehicle
 *   pen_finance / pen_insurance / pen_extwarranty / pen_accessory（衍生滲透率集團均值）
 */
export async function getStoreSalesDiagnostics(
  brandId: string,
  orgId: string,
  opts: { period?: string } = {},
): Promise<StoreSalesDiagnostics | null> {
  const client = await createClient();

  // 門店基本資訊
  const { data: storeRow } = await client
    .from("organizations")
    .select("id, name, short_name")
    .eq("brand_id", brandId)
    .eq("id", orgId)
    .maybeSingle();
  if (!storeRow) return null;
  const store: StoreLite = {
    id: (storeRow as { id: string }).id,
    name: (storeRow as { name: string }).name,
    short_name: (storeRow as { short_name: string | null }).short_name,
  };

  const { period, metrics } = await loadStoreMetrics(client, brandId, orgId, opts.period);
  const bench = await loadNationalBenchmarks(client, brandId);

  const volume = m(metrics, "sales_volume");
  const volumeTarget = m(metrics, "sales_volume_target");

  // 漏斗 5 階段（rate = 相對前一階段轉換率）
  const funnelDefs: Array<[string, string]> = [
    ["來店/名單", "funnel_lead"],
    ["試乘", "funnel_test_ride"],
    ["報價", "funnel_quote"],
    ["成交", "funnel_order"],
    ["交車", "funnel_delivered"],
  ];
  const funnel: FunnelStage[] = [];
  let prevCount: number | null = null;
  for (const [stage, key] of funnelDefs) {
    const count = m(metrics, key) ?? 0;
    const rate = prevCount && prevCount > 0 ? count / prevCount : null;
    funnel.push({ stage, count, rate });
    prevCount = count;
  }

  const conversion = m(metrics, "conversion_rate");
  const gp3 = m(metrics, "gp3_per_vehicle");

  const derivative: DerivativePenetration = {
    finance: m(metrics, "pen_finance"),
    insurance: m(metrics, "pen_insurance"),
    extwarranty: m(metrics, "pen_extwarranty"),
    accessory: m(metrics, "pen_accessory"),
    national: {
      finance: m(bench, "pen_finance"),
      insurance: m(bench, "pen_insurance"),
      extwarranty: m(bench, "pen_extwarranty"),
      accessory: m(bench, "pen_accessory"),
    },
  };

  // 自動診斷文字（簡單門檻；比較均值 / 目標）
  const diagnostics: string[] = [];
  const benchConv = m(bench, "conversion_rate");
  if (conversion != null && benchConv != null) {
    if (conversion < benchConv * 0.9) {
      diagnostics.push(
        `成交率 ${(conversion * 100).toFixed(1)}% 低於集團均值 ${(benchConv * 100).toFixed(1)}%，建議檢視銷售流程與試乘轉換。`,
      );
    } else if (conversion > benchConv * 1.1) {
      diagnostics.push(`成交率 ${(conversion * 100).toFixed(1)}% 優於集團均值，可作為標竿門店分享經驗。`);
    }
  }
  const benchGp3 = m(bench, "gp3_per_vehicle");
  if (gp3 != null && benchGp3 != null && gp3 < benchGp3 * 0.9) {
    diagnostics.push(`單車 GP3 低於集團均值，留意折讓控管與配件搭售。`);
  }
  if (volume != null && volumeTarget != null && volumeTarget > 0 && volume < volumeTarget * 0.8) {
    diagnostics.push(
      `本月銷量 ${volume} 台，達成率僅 ${((volume / volumeTarget) * 100).toFixed(0)}%，距月目標尚有缺口。`,
    );
  }
  if (derivative.finance != null && derivative.national.finance != null && derivative.finance < derivative.national.finance * 0.85) {
    diagnostics.push(`金融滲透率低於集團均值，衍生毛利有提升空間。`);
  }

  return {
    store,
    period: period ?? (opts.period ?? ""),
    kpis: {
      sales_volume: {
        value: volume,
        target: volumeTarget,
        rate: ratio(volume, volumeTarget),
        trend: trendOf(m(metrics, "sales_volume_trend")),
      },
      conversion_rate: { value: conversion },
      gp3_per_vehicle: { value: gp3, trend: trendOf(m(metrics, "gp3_trend")) },
      derivative_gp_per_vehicle: { value: m(metrics, "derivative_gp_per_vehicle") },
    },
    benchmark: {
      conversion_rate: benchConv,
      gp3_per_vehicle: benchGp3,
    },
    funnel,
    derivative,
    wholesale_ratio: m(metrics, "wholesale_ratio"),
    diagnostics,
  };
}

/* ────────────── (3) getStoreServiceDiagnostics（GRP10） ────────────── */

/**
 * 門店單月售後體檢。全部 metric 讀 kpi_snapshots 門店層 + org_benchmarks。
 *
 * 【資料合約 — kpi_snapshots（org_id=門店, staff_id=NULL）metric_key】
 *   service_count / service_count_target / service_count_trend(1|0|-1)
 *   revenue_per_vehicle / revenue_per_vehicle_trend(1|0|-1)
 *   svc_gross_margin_rate(0..1)
 *   absorption_rate(0..1)
 *   rework_rate(0..1)
 *   workshop_efficiency / workshop_utilization / workshop_productivity（各 0..1）
 *   mix_maintenance / mix_repair / mix_bodywork / mix_other（業務結構計數）
 *   parts_fulfill_rate(0..1) / parts_turnover / parts_deadstock_pct(0..1)
 *     / parts_direct_sale_amt / parts_direct_sale_margin(0..1)
 *   accessory_install_rate(0..1) / accessory_margin(0..1)
 *   cflow_new_m0..m4 / cflow_lost_m0..m4（近 5 月客戶流動，m0=最近月）
 *   cflow_month_m0..m4（各月份字串無法存 numeric → 改由 metadata 或前端用 period 推；
 *     此處以 period 往前推 5 月當月份標籤，不另存 metric）
 * 【資料合約 — org_benchmarks（scope='national'）metric_key】
 *   revenue_per_vehicle / svc_gross_margin_rate / absorption_rate
 */
export async function getStoreServiceDiagnostics(
  brandId: string,
  orgId: string,
  opts: { period?: string } = {},
): Promise<StoreServiceDiagnostics | null> {
  const client = await createClient();

  const { data: storeRow } = await client
    .from("organizations")
    .select("id, name, short_name")
    .eq("brand_id", brandId)
    .eq("id", orgId)
    .maybeSingle();
  if (!storeRow) return null;
  const store: StoreLite = {
    id: (storeRow as { id: string }).id,
    name: (storeRow as { name: string }).name,
    short_name: (storeRow as { short_name: string | null }).short_name,
  };

  const { period, metrics } = await loadStoreMetrics(client, brandId, orgId, opts.period);
  const bench = await loadNationalBenchmarks(client, brandId);

  const serviceCount = m(metrics, "service_count");
  const serviceTarget = m(metrics, "service_count_target");
  const revPerVehicle = m(metrics, "revenue_per_vehicle");
  const marginRate = m(metrics, "svc_gross_margin_rate");
  const absorption = m(metrics, "absorption_rate");
  const rework = m(metrics, "rework_rate");

  const workshop: WorkshopRates = {
    efficiency: m(metrics, "workshop_efficiency"),
    utilization: m(metrics, "workshop_utilization"),
    productivity: m(metrics, "workshop_productivity"),
  };

  const serviceMix: ServiceTypeBucket[] = [
    { type: "定期保養", count: m(metrics, "mix_maintenance") ?? 0 },
    { type: "一般維修", count: m(metrics, "mix_repair") ?? 0 },
    { type: "鈑金鈑噴", count: m(metrics, "mix_bodywork") ?? 0 },
    { type: "其他", count: m(metrics, "mix_other") ?? 0 },
  ];

  const parts: PartsInventoryHealth = {
    fulfill_rate: m(metrics, "parts_fulfill_rate"),
    turnover: m(metrics, "parts_turnover"),
    deadstock_pct: m(metrics, "parts_deadstock_pct"),
    direct_sale_amt: m(metrics, "parts_direct_sale_amt"),
    direct_sale_margin: m(metrics, "parts_direct_sale_margin"),
  };

  const accessory: AccessoryInstall = {
    install_rate: m(metrics, "accessory_install_rate"),
    margin: m(metrics, "accessory_margin"),
  };

  // 客戶流動近 5 月：以 period 往前推月份標籤（m0=最近月=period）
  const basePeriod = period ?? opts.period ?? null;
  const customerFlow: CustomerFlowPoint[] = [];
  for (let i = 4; i >= 0; i--) {
    const newC = m(metrics, `cflow_new_m${i}`) ?? 0;
    const lostC = m(metrics, `cflow_lost_m${i}`) ?? 0;
    customerFlow.push({
      month: basePeriod ? shiftMonth(basePeriod, -i) : `m${i}`,
      new: newC,
      lost: lostC,
      net: newC - lostC,
    });
  }

  // 自動診斷文字
  const diagnostics: string[] = [];
  if (rework != null && rework > 0.05) {
    diagnostics.push(`返修率 ${(rework * 100).toFixed(1)}% 高於 5% 警戒線，建議稽核維修品質與技師訓練。`);
  }
  const benchAbsorption = m(bench, "absorption_rate");
  if (absorption != null && benchAbsorption != null && absorption < benchAbsorption * 0.9) {
    diagnostics.push(
      `售後吸收率 ${(absorption * 100).toFixed(0)}% 低於集團均值 ${(benchAbsorption * 100).toFixed(0)}%，後勤獲利能力偏弱。`,
    );
  }
  if (serviceCount != null && serviceTarget != null && serviceTarget > 0 && serviceCount < serviceTarget * 0.85) {
    diagnostics.push(`維修台次達成率 ${((serviceCount / serviceTarget) * 100).toFixed(0)}%，進廠量需提升。`);
  }
  if (parts.deadstock_pct != null && parts.deadstock_pct > 0.15) {
    diagnostics.push(`呆滯料佔比 ${(parts.deadstock_pct * 100).toFixed(0)}% 偏高，建議清理長庫齡零件。`);
  }
  const netFlow = customerFlow.reduce((s, p) => s + p.net, 0);
  if (netFlow < 0) {
    diagnostics.push(`近 5 月客戶淨流動為負（流失 > 新增），需強化回廠召回與保養提醒。`);
  }

  return {
    store,
    period: period ?? (opts.period ?? ""),
    kpis: {
      service_count: {
        value: serviceCount,
        target: serviceTarget,
        rate: ratio(serviceCount, serviceTarget),
        trend: trendOf(m(metrics, "service_count_trend")),
      },
      revenue_per_vehicle: {
        value: revPerVehicle,
        trend: trendOf(m(metrics, "revenue_per_vehicle_trend")),
      },
      gross_margin_rate: { value: marginRate },
      absorption_rate: { value: absorption },
      rework_rate: { value: rework },
    },
    benchmark: {
      revenue_per_vehicle: m(bench, "revenue_per_vehicle"),
      gross_margin_rate: m(bench, "svc_gross_margin_rate"),
      absorption_rate: benchAbsorption,
    },
    workshop,
    serviceMix,
    parts,
    accessory,
    customerFlow,
    diagnostics,
  };
}

/* ────────────── (4) getCrossDeptScatter（GRP11） ────────────── */

/**
 * 跨部門個人能效 union（銷售 + 售後）。內部呼叫 round-16 的兩支 per-staff scatter，
 * 合併成跨部門清單，每筆補 dept / volume / nps / cust_total / churn_count /
 * churn_rate / trend / risk。
 *
 * 【資料合約 — kpi_snapshots（per-staff，staff_id=該員）新增 metric_key】
 *   cust_total（名下客戶總數）
 *   churn_count（流失客戶數）
 *   ↑ 兩者 staff_role 沿用既有：銷售=salesperson、SA=sa。
 *   nps 沿用 round-16 既有 seed（getSalesEfficiencyScatter / getSAEfficiencyScatter 已讀）。
 *
 * orgId 給定時依 staff 的 store（部門名）filter（POC 寬鬆比對，沿用 round-16 dept→store）。
 */
export async function getCrossDeptScatter(
  brandId: string,
  opts: { orgId?: string; period?: "rolling3" | "month" | "quarter" } = {},
): Promise<CrossDeptStaff[]> {
  const client = await createClient();

  // period chip → rollingMonths（沿用 round-16 滾動窗策略）
  const rollingMonths = opts.period === "month" ? 1 : opts.period === "quarter" ? 3 : 3;
  const scatterOpts: ScatterOptions = { rollingMonths };

  const [sales, sa] = await Promise.all([
    getSalesEfficiencyScatter(brandId, scatterOpts),
    getSAEfficiencyScatter(brandId, scatterOpts),
  ]);

  // 撈兩群 staff 的新 metric（cust_total / churn_count）
  const salesIds = sales.map((s) => s.staff_id);
  const saIds = sa.map((s) => s.staff_id);
  const [salesSeed, saSeed] = await Promise.all([
    loadSeededMetrics(client, brandId, "salesperson", salesIds),
    loadSeededMetrics(client, brandId, "sa", saIds),
  ]);

  const out: CrossDeptStaff[] = [];

  const pushRow = (
    base: {
      staff_id: string;
      name: string;
      store: string | null;
      nps: number | null;
    },
    dept: "sales" | "service",
    volume: number,
    seed: SeededMetrics,
  ) => {
    const custTotal = seed["cust_total"] ?? null;
    const churnCount = seed["churn_count"] ?? null;
    const churnRate =
      custTotal != null && custTotal > 0 && churnCount != null ? churnCount / custTotal : null;
    out.push({
      staff_id: base.staff_id,
      name: base.name,
      store: base.store,
      dept,
      volume,
      nps: base.nps,
      cust_total: custTotal,
      churn_count: churnCount,
      churn_rate: churnRate,
      trend: trendOf(seed["trend"] ?? null),
      risk: crossDeptRisk(churnRate, base.nps),
    });
  };

  for (const s of sales) {
    pushRow(
      { staff_id: s.staff_id, name: s.name, store: s.store, nps: s.avg_nps },
      "sales",
      s.deal_count,
      salesSeed.get(s.staff_id) ?? {},
    );
  }
  for (const s of sa) {
    pushRow(
      { staff_id: s.staff_id, name: s.name, store: s.store, nps: s.avg_nps },
      "service",
      s.intake_count,
      saSeed.get(s.staff_id) ?? {},
    );
  }

  // orgId filter：依 store（部門名）比對（POC 寬鬆）。給 orgId 時解析其 name 比對。
  if (opts.orgId) {
    const { data: org } = await client
      .from("organizations")
      .select("name, short_name")
      .eq("brand_id", brandId)
      .eq("id", opts.orgId)
      .maybeSingle();
    const orgName = org ? (org as { name: string }).name : null;
    const orgShort = org ? (org as { short_name: string | null }).short_name : null;
    if (orgName) {
      return out.filter(
        (r) =>
          r.store != null &&
          (r.store === orgName || (orgShort != null && r.store === orgShort) ||
            r.store.includes(orgName) || orgName.includes(r.store)),
      );
    }
  }

  return out;
}

/** GRP11 風險分類：流失率高=danger、NPS 高且流失低=star，缺值=neutral，其餘=watch。 */
function crossDeptRisk(churnRate: number | null, nps: number | null): EfficiencyTag {
  if (churnRate == null && nps == null) return "neutral";
  if (churnRate != null && churnRate > 0.15) return "danger";
  if (nps != null && nps >= 70 && (churnRate == null || churnRate < 0.05)) return "star";
  if ((churnRate != null && churnRate > 0.08) || (nps != null && nps < 40)) return "watch";
  return "neutral";
}

/* ────────────── (5) getStoreMonthlyTrend ────────────── */

/**
 * 近 6 月 + 去年同期雙線。從 kpi_snapshots（org_id + metric_key + period_month 序列）撈。
 *
 * 【資料合約 — kpi_snapshots（org_id=門店, staff_id=NULL）】
 *   同一 metric_key 跨多個 period_month（近 6 月 current + 各自去年同月 prevYear，
 *   共 ~12+ period）。metricKey 由 caller 指定（例：sales_volume / service_count）。
 *
 * 回傳 months（近 6 月，舊→新）、current（近 6 月值）、prevYear（各月去年同期值）。
 * 缺值補 0（趨勢圖斷線交給前端 null 判斷；此處量型 metric 缺月補 0 較直覺）。
 */
export async function getStoreMonthlyTrend(
  brandId: string,
  orgId: string,
  metricKey: string,
): Promise<{ months: string[]; current: number[]; prevYear: number[] }> {
  const client = await createClient();

  // 撈該 org + metric 全部 period（量小），client 端依月份索引
  const { data } = await client
    .from("kpi_snapshots")
    .select("period_month, metric_value")
    .eq("brand_id", brandId)
    .eq("org_id", orgId)
    .is("staff_id", null)
    .eq("metric_key", metricKey)
    .order("period_month", { ascending: false });

  const byMonth = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ period_month: string; metric_value: number | null }>) {
    if (r.metric_value == null) continue;
    // period_month 是 date；正規化成 YYYY-MM-01
    const key = normalizeMonth(r.period_month);
    if (!byMonth.has(key)) byMonth.set(key, r.metric_value);
  }

  // 以資料中最新月為基準（無資料則用今天），往前列近 6 月
  const latest = data && data.length > 0 ? normalizeMonth((data[0] as { period_month: string }).period_month) : currentMonth();
  const months: string[] = [];
  const current: number[] = [];
  const prevYear: number[] = [];
  for (let i = 5; i >= 0; i--) {
    const mKey = shiftMonth(latest, -i);
    const pKey = shiftMonth(mKey, -12);
    months.push(mKey);
    current.push(byMonth.get(mKey) ?? 0);
    prevYear.push(byMonth.get(pKey) ?? 0);
  }

  return { months, current, prevYear };
}

/* ────────────── 月份工具（純函式，無時區依賴；只取 Y-M） ────────────── */

/** 任意 date 字串 → YYYY-MM-01。 */
function normalizeMonth(d: string): string {
  const [y, mo] = d.split("-");
  return `${y}-${mo}-01`;
}

/** YYYY-MM-01 加減 N 月（delta 可負）→ YYYY-MM-01。 */
function shiftMonth(ym: string, delta: number): string {
  const [y, mo] = ym.split("-").map((s) => parseInt(s, 10));
  // 轉成「絕對月序」再加減，避免 Date 時區誤差
  const total = y * 12 + (mo - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

/** 今天的月份 YYYY-MM-01（Asia/Taipei 與 UTC 同月，POC 容許）。 */
function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/* ══════════════════════════════════════════════════════════════════════════
 *  第十八輪 — 集團策略評估層（DealerHealth / 戰略象限）Batch A 地基 append
 *  （不改既有 export；沿用 round-16/17 的 loadStoreMetrics / listDiagnosticStores
 *    / month utils / EfficiencyTag / StoreLite）
 *
 *  本層是「集團總部一眼看遍所有門店健康度」的儀表：六維健康分數雷達 + 戰略象限散佈
 *  + 跨季趨勢。資料策略沿用：門店層指標（org_id=門店、staff_id IS NULL）一律讀
 *  kpi_snapshots（demo seed 會塞）；issues / strategy / tag 由 helper「規則生成」，
 *  不另存 seed（這樣 seed 只要塞六維分數 + 幾個衍生欄位，文字描述全由 code 算）。
 *
 *  ── 季度錨點 ──
 *  本層用「季別」當時間軸。period_month 的月份映季別：
 *    月 1-3 → Q1、4-6 → Q2、7-9 → Q3、10-12 → Q4，label = `YYYY Qn`。
 *  seed 可以每季塞一筆（period_month 用該季任一月，建議用季首月 1/4/7/10）。
 *
 *  全部對「無資料」安全：回空陣列 / null，不 throw。
 * ════════════════════════════════════════════════════════════════════════ */

/* ────────────── 共用型別（策略評估層） ────────────── */

// HealthDim 型別 + HEALTH_DIM_LABEL 值已移到 ./group-analytics-labels
// （"use server" 檔不可 export 非 async 物件；本檔頂部已 import 供內部使用）。

/** issue 文字的人話模板（維度偏低時掛這句）。 */
const HEALTH_DIM_ISSUE_HINT: Record<HealthDim, string> = {
  dim_sales: "銷售動能不足，留意來客量與成交率。",
  dim_after: "返修率可能異常或進廠量偏低，需稽核維修品質。",
  dim_parts: "零件供應/週轉偏弱，留意呆滯料與滿足率。",
  dim_people: "人才能效或留任偏弱，留意人均產值與流動率。",
  dim_csat: "客戶滿意度偏低，NPS 與回廠忠誠需強化。",
  dim_finance: "財務體質偏弱，留意毛利率與費用控管。",
};

const HEALTH_DIMS: HealthDim[] = [
  "dim_sales",
  "dim_after",
  "dim_parts",
  "dim_people",
  "dim_csat",
  "dim_finance",
];

/** 健康分數頁的一筆門店（六維 + 規則生成的診斷文字 + tag）。 */
export type StoreHealthScore = {
  store: StoreLite;
  period: string; // YYYY-MM-01（seed 的季首月）
  /** 季別標籤（YYYY Qn） */
  quarter: string;
  /** 綜合健康分數 0-100（seed health_score；缺則六維等權平均 fallback） */
  score: number | null;
  /** 上期健康分數（seed health_score_prev；缺回 null） */
  scorePrev: number | null;
  /** 環比變化（score - scorePrev；任一缺回 null） */
  delta: number | null;
  /** 六維分數（各 0-100；缺回 null） */
  dims: Record<HealthDim, number | null>;
  /** 衍生指標（戰略象限 / KPI 卡用） */
  achievement_rate: number | null; // 目標達成率 0..1
  gross_profit_rate: number | null; // 毛利率 0..1
  store_nps: number | null; // 門店 NPS
  growth_rate: number | null; // 成長率（同比）0..1（可負）
  revenue_scale: number | null; // 營收規模（散佈圖點大小用）
  staff_count: number | null; // 員工數
  /** 戰略象限（前端依均值十字動態分類；helper 先留 null） */
  quad: "tl" | "tr" | "bl" | "br" | null;
  /** 規則生成的問題清單（掃六維 <60 bad、60-75 warn） */
  issues: Array<{ level: "warn" | "bad"; dim: string; text: string }>;
  /** 規則生成的一句策略建議 */
  strategy: string;
  /** 依綜合分數分級對映（>=80 star / 65-80 neutral / 50-65 watch / <50 danger） */
  tag: EfficiencyTag;
};

/** 跨季健康分數歷史（趨勢圖用）。 */
export type StoreScoreHistory = {
  store: StoreLite;
  /** 季別標籤序列（舊→新，YYYY Qn） */
  quarters: string[];
  /** 各季綜合健康分數（與 quarters 同長度；null=該季缺值） */
  scores: Array<number | null>;
  /** 兩條趨勢線（健康分數 + 目標達成率） */
  axes: {
    health: Array<number | null>;
    achievement: Array<number | null>;
  };
};

/* ────────────── 季度工具（純函式） ────────────── */

/** YYYY-MM-01（或任意 date 字串）→ 季別標籤 `YYYY Qn`。 */
function quarterLabel(d: string): string {
  const [y, mo] = d.split("-").map((s) => parseInt(s, 10));
  const q = Math.floor((mo - 1) / 3) + 1;
  return `${y} Q${q}`;
}

/** 六維等權平均（任一缺值仍以現有維度平均；全缺回 null）。 */
function sixDimAverage(dims: Record<HealthDim, number | null>): number | null {
  const vals = HEALTH_DIMS.map((k) => dims[k]).filter(
    (v): v is number => v != null && !Number.isNaN(v),
  );
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

/** 綜合分數 → EfficiencyTag（star/neutral/watch/danger）。 */
function healthTag(score: number | null): EfficiencyTag {
  if (score == null) return "neutral";
  if (score >= 80) return "star";
  if (score >= 65) return "neutral";
  if (score >= 50) return "watch";
  return "danger";
}

/** 規則生成：掃六維產 issues（<60 bad、60-75 warn）。 */
function buildHealthIssues(
  dims: Record<HealthDim, number | null>,
): Array<{ level: "warn" | "bad"; dim: string; text: string }> {
  const issues: Array<{ level: "warn" | "bad"; dim: string; text: string }> = [];
  for (const k of HEALTH_DIMS) {
    const v = dims[k];
    if (v == null || Number.isNaN(v)) continue;
    const label = HEALTH_DIM_LABEL[k];
    if (v < 60) {
      issues.push({
        level: "bad",
        dim: label,
        text: `${label}維度 ${Math.round(v)} 分偏低 — ${HEALTH_DIM_ISSUE_HINT[k]}`,
      });
    } else if (v <= 75) {
      issues.push({
        level: "warn",
        dim: label,
        text: `${label}維度 ${Math.round(v)} 分待加強 — ${HEALTH_DIM_ISSUE_HINT[k]}`,
      });
    }
  }
  return issues;
}

/** 規則生成：依綜合分數分級 + 最弱維度，產一句策略建議。 */
function buildHealthStrategy(
  score: number | null,
  dims: Record<HealthDim, number | null>,
): string {
  // 找最弱維度
  let weakest: HealthDim | null = null;
  let weakestVal = Infinity;
  for (const k of HEALTH_DIMS) {
    const v = dims[k];
    if (v == null || Number.isNaN(v)) continue;
    if (v < weakestVal) {
      weakestVal = v;
      weakest = k;
    }
  }
  const weakLabel = weakest ? HEALTH_DIM_LABEL[weakest] : null;

  if (score == null) {
    return "資料不足，建議先補齊各維度績效快照後再行評估。";
  }
  if (score >= 80) {
    return weakLabel && weakestVal < 75
      ? `綜合表現優異，可作為集團標竿；唯「${weakLabel}」維度相對最弱，鞏固後即全面領先。`
      : "綜合表現優異、六維均衡，建議列為集團標竿門店並萃取可複製的營運做法。";
  }
  if (score >= 65) {
    return weakLabel
      ? `整體穩健，瓶頸在「${weakLabel}」（${Math.round(weakestVal)} 分）；集中資源補強此維度可推升綜合分數。`
      : "整體穩健，建議鎖定單一最弱維度集中突破。";
  }
  if (score >= 50) {
    return weakLabel
      ? `表現待輔導，最弱維度為「${weakLabel}」（${Math.round(weakestVal)} 分）；建議列入季度輔導名單、訂定改善里程碑。`
      : "表現待輔導，建議列入季度輔導名單並訂定改善里程碑。";
  }
  return weakLabel
    ? `綜合分數偏低（${Math.round(score)} 分）屬高風險門店，核心痛點「${weakLabel}」；建議總部介入診斷、優先資源挹注。`
    : `綜合分數偏低屬高風險門店，建議總部立即介入診斷。`;
}

/* ────────────── (A1) getDealerHealthScores ────────────── */

/**
 * 集團所有門店的健康分數總覽（戰略評估首頁 / 健康分數雷達 / 戰略象限散佈圖共用）。
 * 對每間 listDiagnosticStores 的門店，讀「最新一期」門店層 metric（org_id=門店、
 * staff_id IS NULL；opts.period 指定則鎖該期）。
 *
 * 【資料合約 — kpi_snapshots（org_id=門店, staff_id=NULL, staff_role=NULL）metric_key】
 *   ── 綜合 / 環比（seed）──
 *   health_score(0-100)              綜合健康分數；缺則 helper 用六維等權平均 fallback
 *   health_score_prev(0-100)         上期綜合健康分數（算 delta 用）
 *   ── 六維（seed，各 0-100）──
 *   dim_sales / dim_after / dim_parts / dim_people / dim_csat / dim_finance
 *   ── 衍生指標（seed；戰略象限與 KPI 卡用）──
 *   achievement_rate(0..1)           目標達成率
 *   gross_profit_rate(0..1)          毛利率
 *   store_nps                        門店 NPS（-100..100 或 0..100，seed 自訂）
 *   growth_rate(0..1，可負)          同比成長率
 *   revenue_scale                    營收規模（散佈圖點大小；無門店 FK 的交易表算不出 → seed）
 *   staff_count                      員工數（同上 → seed）
 *
 * 【helper 規則生成、不讀 seed】：
 *   • score = health_score ?? 六維等權平均（兩者 seed 一致即可，helper 提供 fallback）
 *   • issues：掃六維，<60 標 bad、60-75 標 warn，附人話（不存 seed）
 *   • strategy：依綜合分數分級 + 最弱維度產一句（不存 seed）
 *   • tag：依綜合分數分級（>=80 star / 65-80 neutral / 50-65 watch / <50 danger）
 *   • quad：先留 null（前端依「全集均值十字」動態分類；helper 不臆測象限）
 *
 * ⚠️ revenue_scale / staff_count 卡點：現行交易表（sales_orders / repair_orders）
 *    無可靠門店 FK（rs_name 是文字、repair_orders 走 sa_id），無法穩定彙總到門店層
 *    → 一律 seed。詳見回報「卡點」。
 */
export async function getDealerHealthScores(
  brandId: string,
  opts: { period?: string } = {},
): Promise<StoreHealthScore[]> {
  const client = await createClient();
  const stores = await listDiagnosticStores(brandId);
  if (stores.length === 0) return [];

  const bench = await loadNationalBenchmarks(client, brandId); // 預留：前端對標用，目前型別未直接吐
  void bench;

  const out: StoreHealthScore[] = [];
  for (const store of stores) {
    const { period, metrics } = await loadStoreMetrics(client, brandId, store.id, opts.period);

    const dims: Record<HealthDim, number | null> = {
      dim_sales: m(metrics, "dim_sales"),
      dim_after: m(metrics, "dim_after"),
      dim_parts: m(metrics, "dim_parts"),
      dim_people: m(metrics, "dim_people"),
      dim_csat: m(metrics, "dim_csat"),
      dim_finance: m(metrics, "dim_finance"),
    };

    const seedScore = m(metrics, "health_score");
    const score = seedScore ?? sixDimAverage(dims);
    const scorePrev = m(metrics, "health_score_prev");
    const delta = score != null && scorePrev != null ? score - scorePrev : null;

    const periodStr = period ?? opts.period ?? "";

    out.push({
      store,
      period: periodStr,
      quarter: periodStr ? quarterLabel(periodStr) : "",
      score,
      scorePrev,
      delta,
      dims,
      achievement_rate: m(metrics, "achievement_rate"),
      gross_profit_rate: m(metrics, "gross_profit_rate"),
      store_nps: m(metrics, "store_nps"),
      growth_rate: m(metrics, "growth_rate"),
      revenue_scale: m(metrics, "revenue_scale"),
      staff_count: m(metrics, "staff_count"),
      quad: null, // 前端依全集均值十字動態分類
      issues: buildHealthIssues(dims),
      strategy: buildHealthStrategy(score, dims),
      tag: healthTag(score),
    });
  }

  return out;
}

/* ────────────── (A2) getStoreScoreHistory ────────────── */

/**
 * 集團所有門店的「跨季」健康分數歷史（趨勢圖用，預設近 5 季）。
 * 對每店讀「所有」health_score row（+ achievement_rate）依 period_month 排序，
 * 取最後 N 季當序列。
 *
 * 【資料合約 — kpi_snapshots（org_id=門店, staff_id=NULL）跨多 period】
 *   health_score(0-100)        每季一筆（period_month 用該季首月：1/4/7/10 月）
 *   achievement_rate(0..1)     每季一筆（同上 period 對齊）
 *
 * 季度錨點：period_month 月份映季別（1-3→Q1…），同季多筆取最新（依 created/period 序，
 * 此處以 period_month 去重，一季一值）。N = opts.quarters（預設 5）。
 */
export async function getStoreScoreHistory(
  brandId: string,
  opts: { quarters?: number } = {},
): Promise<StoreScoreHistory[]> {
  const client = await createClient();
  const n = Math.max(1, opts.quarters ?? 5);
  const stores = await listDiagnosticStores(brandId);
  if (stores.length === 0) return [];

  const out: StoreScoreHistory[] = [];
  for (const store of stores) {
    // 撈該店 health_score + achievement_rate 全部 period（量小），client 端依季彙整
    const { data } = await client
      .from("kpi_snapshots")
      .select("period_month, metric_key, metric_value")
      .eq("brand_id", brandId)
      .eq("org_id", store.id)
      .is("staff_id", null)
      .in("metric_key", ["health_score", "achievement_rate"])
      .order("period_month", { ascending: true });

    const rows = (data ?? []) as Array<{
      period_month: string;
      metric_key: string;
      metric_value: number | null;
    }>;

    // 依季別彙整：每季一個 bucket（同季多筆取最後出現＝較新 period）
    const byQuarter = new Map<
      string,
      { period: string; health: number | null; achievement: number | null }
    >();
    for (const r of rows) {
      const q = quarterLabel(r.period_month);
      const bucket = byQuarter.get(q) ?? { period: r.period_month, health: null, achievement: null };
      bucket.period = r.period_month; // asc 排序，後者較新
      if (r.metric_key === "health_score") bucket.health = r.metric_value;
      else if (r.metric_key === "achievement_rate") bucket.achievement = r.metric_value;
      byQuarter.set(q, bucket);
    }

    // 依 period 排序（季別 key 本身可比，但用 period 更穩），取最後 N 季
    const ordered = [...byQuarter.entries()]
      .sort((a, b) => a[1].period.localeCompare(b[1].period))
      .slice(-n);

    out.push({
      store,
      quarters: ordered.map(([q]) => q),
      scores: ordered.map(([, v]) => v.health),
      axes: {
        health: ordered.map(([, v]) => v.health),
        achievement: ordered.map(([, v]) => v.achievement),
      },
    });
  }

  return out;
}

/* ══════════════════════════════════════════════════════════════
   (A3/A4) 第十九輪 GRP18 集團客戶動態
   ── 資料策略（路線 b，全 seed、helper 純讀）──
   集團/門店全部讀 kpi_snapshots（metadata._seed='round19-customer-dynamics'）。
   集團層 org_id=NULL、門店層帶 round17 既有 5 store uuid、當期 period_month=2026-06-01、
   NPS 月度為 2026-01..06 六點。
   ⚠️ helper 純讀 metric_value，**禁止在 helper 硬塞常數**（重演 Health Score 陷阱的點）。
   ⚠️ v2 資料真相校驗結論：集團漏斗/流失率/NPS/高風險名單**皆無法上捲** round17/既有 seed，
       全部新 seed；跨頁「共用」以 CHURN_RISK_DAYS 閾值口徑對齊兌現（與 CRM04A 同一份常數）。

   【資料合約 — kpi_snapshots（staff_id=NULL；集團 org_id=NULL / 門店 org_id=store uuid）】
     ◦ KPI：cust_active_total / new_cust_total / repurchase_rate(0..1) / churn_rate(0..1) / group_nps
     ◦ 漏斗：lc_funnel_{prospect,contact,testride,firstbuy,repurchase}（計數；集團=5 店加總）
     ◦ 來源 donut：source_{referral,event,online,walkin,other}（百分比，每 scope 合 100）
     ◦ 客戶狀態：cust_state_{active,dormant60,dormant120,dormant180,lost}（集團計數）
     ◦ 門店流動：flow_{new,repeat,churn}（per-store 計數）
     ◦ 流失原因：lost_reason_{service,competitor,price,relocate,other}（集團百分比）
     ◦ NPS 月度：nps_monthly（period_month=月份 2026-01..06；集團 org_id=NULL / 門店 org_id=store）
     ◦ 高風險彙總：risk_over90 / risk_over180 / risk_avg_days / risk_pct_active（per-store）
     ◦ 高風險計數：churn_risk_high_count（集團合計 + 各店）
     ◦ 逐客戶名單：cust_list（per-store；計數在 metric_value、明細在 metadata.customers[] jsonb 陣列）
   ══════════════════════════════════════════════════════════════ */

/** 一個維度的 metric 值（key/label/color + 值）。 */
export type CustomerMetricDatum = DimDef & { value: number | null };

/** 客戶關鍵指標（集團 / 門店共用）。 */
export type CustomerKpis = {
  active: number | null; // cust_active_total
  newCust: number | null; // new_cust_total
  repurchaseRate: number | null; // repurchase_rate 0..1
  churnRate: number | null; // churn_rate 0..1
  nps: number | null; // 集團=group_nps；門店=nps_monthly 末點
};

/** NPS 月度走勢一點（month=YYYY-MM-01）。 */
export type NpsPoint = { month: string; value: number | null };

/** 集團彙總高風險表一列（per-store）。 */
export type StoreRiskRow = {
  store: StoreLite;
  over90: number | null;
  over180: number | null;
  avgDays: number | null;
  pctActive: number | null; // 已是百分比值（2.4 而非 0.024）
  /** 規則生成的建議行動 */
  action: { level: "warn" | "danger"; text: string };
};

/** 門店客戶流動對比一列（per-store new/repeat/churn）。 */
export type StoreFlowRow = {
  store: StoreLite;
  newCust: number | null;
  repeat: number | null;
  churn: number | null;
};

/** 單一匿名客戶（cust_list metadata.customers[] 陣列元素）。 */
export type CustomerRow = {
  id: string;
  model: string;
  buyDate: string;
  lastVisit: string;
  days: number;
  warranty: string;
  visits: number;
  type: string;
  risk: "low" | "warn" | "danger";
};

/** GRP18 集團總覽（一頁打天下的集團視圖）。 */
export type GroupCustomerDynamics = {
  period: string;
  kpis: CustomerKpis;
  funnel: CustomerMetricDatum[];
  sources: CustomerMetricDatum[];
  states: CustomerMetricDatum[];
  lostReasons: CustomerMetricDatum[];
  storeFlow: StoreFlowRow[];
  npsTrend: NpsPoint[];
  riskTable: StoreRiskRow[];
  riskTotal: { over90: number; over180: number; avgDays: number | null; pctActive: number | null };
  highRiskCount: number | null; // churn_risk_high_count（集團）
  alerts: string[]; // 規則生成
};

/** GRP18 單店深鑽視圖。 */
export type StoreCustomerJourney = {
  store: StoreLite;
  period: string;
  kpis: CustomerKpis;
  funnel: CustomerMetricDatum[];
  npsTrend: NpsPoint[];
  miniStats: Array<{ label: string; value: string; tone: "navy" | "green" | "amber" | "red" }>;
  customers: CustomerRow[];
  highRisk: CustomerRow[]; // days >= CHURN_RISK_DAYS.high
  highRiskCount: number | null;
  alerts: string[];
};

/* ────────────── GRP18 內部 loader / 工具 ────────────── */

/** 撈集團層（org_id IS NULL）某期所有 metric。未指定 period → 鎖最新一期。 */
async function loadGroupMetrics(
  client: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  period?: string,
): Promise<{ period: string | null; metrics: Map<string, number | null> }> {
  let query = client
    .from("kpi_snapshots")
    .select("period_month, metric_key, metric_value")
    .eq("brand_id", brandId)
    .is("org_id", null)
    .is("staff_id", null);
  if (period) query = query.eq("period_month", period);
  const { data } = await query.order("period_month", { ascending: false });
  const rows = (data ?? []) as Array<{
    period_month: string;
    metric_key: string;
    metric_value: number | null;
  }>;
  if (rows.length === 0) return { period: period ?? null, metrics: new Map() };
  // nps_monthly 跨 6 期 → 鎖定最新一期只取當期 snapshot metric（趨勢另由 loadNpsMonthly 撈）
  const targetPeriod = period ?? rows[0].period_month;
  const metrics = new Map<string, number | null>();
  for (const r of rows) {
    if (r.period_month !== targetPeriod) continue;
    if (!metrics.has(r.metric_key)) metrics.set(r.metric_key, r.metric_value);
  }
  return { period: targetPeriod, metrics };
}

/** 撈 nps_monthly 月度序列（org_id=null 集團 / =store 門店），舊→新。 */
async function loadNpsMonthly(
  client: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  orgId: string | null,
): Promise<NpsPoint[]> {
  let q = client
    .from("kpi_snapshots")
    .select("period_month, metric_value")
    .eq("brand_id", brandId)
    .eq("metric_key", "nps_monthly")
    .is("staff_id", null);
  q = orgId === null ? q.is("org_id", null) : q.eq("org_id", orgId);
  const { data } = await q.order("period_month", { ascending: true });
  return ((data ?? []) as Array<{ period_month: string; metric_value: number | null }>).map((r) => ({
    month: r.period_month,
    value: r.metric_value,
  }));
}

/** 撈某店 cust_list 的匿名客戶陣列（metadata.customers jsonb）。 */
async function loadCustList(
  client: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  storeId: string,
): Promise<CustomerRow[]> {
  const { data } = await client
    .from("kpi_snapshots")
    .select("metadata")
    .eq("brand_id", brandId)
    .eq("org_id", storeId)
    .eq("metric_key", "cust_list")
    .order("period_month", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as { metadata: { customers?: CustomerRow[] } | null } | undefined;
  return row?.metadata?.customers ?? [];
}

/** Map + DimDef[] → 帶值的維度清單。 */
function dimData(metrics: Map<string, number | null>, defs: DimDef[]): CustomerMetricDatum[] {
  return defs.map((d) => ({ ...d, value: m(metrics, d.key) }));
}

/** rate(0..1) → "7.2%"（確定性格式，缺回 "—"）。 */
function pct1(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

/** 高風險彙總建議行動（規則：均值 ≥150 天 或 ≥10 名 180 天 → 優先電話；否則 關懷簡訊）。 */
function riskAction(
  avgDays: number | null,
  over180: number | null,
): { level: "warn" | "danger"; text: string } {
  if ((avgDays != null && avgDays >= 150) || (over180 != null && over180 >= 10)) {
    return { level: "danger", text: "優先電話關懷" };
  }
  return { level: "warn", text: "發送關懷簡訊" };
}

/* ────────────── (A3) getGroupCustomerDynamics（GRP18 集團視圖） ────────────── */

/**
 * 集團客戶動態總覽。集團 KPI/漏斗/來源/狀態/流失原因讀 org_id=NULL；
 * 門店流動 bar + 高風險彙總表迴圈撈各店 org_id；NPS 走勢撈集團 nps_monthly 6 點。
 * 無 seed（metrics 空）回 null。
 */
export async function getGroupCustomerDynamics(
  brandId: string,
  opts: { period?: string } = {},
): Promise<GroupCustomerDynamics | null> {
  const client = await createClient();
  const { period, metrics } = await loadGroupMetrics(client, brandId, opts.period);
  if (metrics.size === 0) return null;
  const periodStr = period ?? opts.period ?? "";

  const stores = await listDiagnosticStores(brandId);

  // per-store 流動 + 高風險彙總（量小，迴圈撈，與 getDealerHealthScores 同 pattern）
  const storeFlow: StoreFlowRow[] = [];
  const riskTable: StoreRiskRow[] = [];
  const storeNps = new Map<string, number | null>(); // alert 用：該店當前 nps = nps_monthly 末點
  for (const store of stores) {
    const { metrics: sm } = await loadStoreMetrics(
      client,
      brandId,
      store.id,
      periodStr || undefined,
    );
    storeFlow.push({
      store,
      newCust: m(sm, "flow_new"),
      repeat: m(sm, "flow_repeat"),
      churn: m(sm, "flow_churn"),
    });
    const over90 = m(sm, "risk_over90");
    const over180 = m(sm, "risk_over180");
    const avgDays = m(sm, "risk_avg_days");
    const pctActive = m(sm, "risk_pct_active");
    riskTable.push({ store, over90, over180, avgDays, pctActive, action: riskAction(avgDays, over180) });
    storeNps.set(store.id, m(sm, "nps_monthly"));
  }

  // 集團合計（over90/over180 加總、avgDays 以 over90 加權、pctActive=over90/active）
  const sumOver90 = riskTable.reduce((s, r) => s + (r.over90 ?? 0), 0);
  const sumOver180 = riskTable.reduce((s, r) => s + (r.over180 ?? 0), 0);
  const weightedDays = riskTable.reduce((s, r) => s + (r.avgDays ?? 0) * (r.over90 ?? 0), 0);
  const avgDaysTotal = sumOver90 > 0 ? Math.round(weightedDays / sumOver90) : null;
  const activeTotal = m(metrics, "cust_active_total");
  const pctActiveTotal =
    activeTotal && activeTotal > 0 ? Number(((sumOver90 / activeTotal) * 100).toFixed(1)) : null;

  const npsTrend = await loadNpsMonthly(client, brandId, null);

  // 規則生成 alerts（3 條：最嚴重 180 天店 / 集團流失率 vs 警戒線 / NPS 最低店）
  const alerts: string[] = [];
  const worst180 = [...riskTable].sort((a, b) => (b.over180 ?? 0) - (a.over180 ?? 0))[0];
  if (worst180 && (worst180.over180 ?? 0) > 0) {
    alerts.push(`${worst180.store.name}：${worst180.over180} 名客戶超過 180 天未回廠，流失風險高`);
  }
  const churn = m(metrics, "churn_rate");
  if (churn != null) {
    alerts.push(`集團整體客戶流失率 ${pct1(churn)}，${churn * 100 > 7 ? "高於" : "低於"}警戒線 7%`);
  }
  let lowestNpsStore: StoreLite | null = null;
  let lowestNps = Infinity;
  for (const s of stores) {
    const v = storeNps.get(s.id);
    if (v != null && v < lowestNps) {
      lowestNps = v;
      lowestNpsStore = s;
    }
  }
  if (lowestNpsStore && lowestNps !== Infinity) {
    alerts.push(`${lowestNpsStore.name} NPS +${lowestNps} 為集團最低，需強化服務體驗`);
  }

  return {
    period: periodStr,
    kpis: {
      active: activeTotal,
      newCust: m(metrics, "new_cust_total"),
      repurchaseRate: m(metrics, "repurchase_rate"),
      churnRate: churn,
      nps: m(metrics, "group_nps"),
    },
    funnel: dimData(metrics, FUNNEL_STAGES),
    sources: dimData(metrics, SOURCE_BUCKETS),
    states: dimData(metrics, CUST_STATES),
    lostReasons: dimData(metrics, LOST_REASONS),
    storeFlow,
    npsTrend,
    riskTable,
    riskTotal: { over90: sumOver90, over180: sumOver180, avgDays: avgDaysTotal, pctActive: pctActiveTotal },
    highRiskCount: m(metrics, "churn_risk_high_count"),
    alerts,
  };
}

/* ────────────── (A4) getStoreCustomerJourney（GRP18 單店深鑽） ────────────── */

/**
 * 單店客戶動態明細。KPI/漏斗/高風險計數讀該店當期 metric；NPS 撈該店 6 點走勢；
 * 客戶名單從 cust_list metadata.customers 取；高風險子集 = days >= CHURN_RISK_DAYS.high。
 * 門店不存在或無 seed 回 null。
 */
export async function getStoreCustomerJourney(
  brandId: string,
  storeId: string,
  opts: { period?: string } = {},
): Promise<StoreCustomerJourney | null> {
  const client = await createClient();
  const stores = await listDiagnosticStores(brandId);
  const store = stores.find((s) => s.id === storeId);
  if (!store) return null;

  const { period, metrics } = await loadStoreMetrics(client, brandId, storeId, opts.period);
  if (metrics.size === 0) return null;
  const periodStr = period ?? opts.period ?? "";

  const npsTrend = await loadNpsMonthly(client, brandId, storeId);
  const customers = await loadCustList(client, brandId, storeId);
  const npsCurrent = npsTrend.length ? npsTrend[npsTrend.length - 1].value : m(metrics, "nps_monthly");

  const active = m(metrics, "cust_active_total");
  const newCust = m(metrics, "new_cust_total");
  const churnRate = m(metrics, "churn_rate");
  const highRisk = customers.filter((c) => c.days >= CHURN_RISK_DAYS.high);

  const npsTone: "navy" | "green" | "amber" | "red" =
    npsCurrent == null
      ? "navy"
      : npsCurrent >= 45
        ? "green"
        : npsCurrent >= 35
          ? "navy"
          : npsCurrent >= 30
            ? "amber"
            : "red";
  const miniStats: StoreCustomerJourney["miniStats"] = [
    { label: "活躍客戶", value: active != null ? String(active) : "—", tone: "navy" },
    { label: "本季新客戶", value: newCust != null ? String(newCust) : "—", tone: "green" },
    { label: "NPS", value: npsCurrent != null ? `+${npsCurrent}` : "—", tone: npsTone },
  ];

  const alerts: string[] = [];
  if (churnRate != null && churnRate * 100 > 7) {
    alerts.push(`客戶流失率 ${pct1(churnRate)}，超過警戒線 7%，建議啟動客戶挽留計畫`);
  }
  const over180 = m(metrics, "risk_over180");
  if (over180 != null && over180 >= 10) {
    alerts.push(`${over180} 名客戶超過 180 天未回廠，建議優先電話關懷`);
  }
  if (npsTrend.length >= 2) {
    const first = npsTrend[0].value;
    const last = npsTrend[npsTrend.length - 1].value;
    if (first != null && last != null) {
      if (last < first) alerts.push(`NPS 近半年由 +${first} 下滑至 +${last}，需強化服務體驗`);
      else if (last > first) alerts.push(`NPS 近半年由 +${first} 回升至 +${last}，維持現有服務策略`);
    }
  }

  return {
    store,
    period: periodStr,
    kpis: {
      active,
      newCust,
      repurchaseRate: m(metrics, "repurchase_rate"),
      churnRate,
      nps: npsCurrent,
    },
    funnel: dimData(metrics, FUNNEL_STAGES),
    npsTrend,
    miniStats,
    customers,
    highRisk,
    highRiskCount: m(metrics, "churn_risk_high_count"),
    alerts,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 *  第二十輪 — 集團商務管理層 GRP12 集團零件財務總覽 Batch A append
 *  （不改既有 export；沿用 loadStoreMetrics / loadGroupMetrics / listDiagnosticStores
 *    / month utils / m() / StoreLite / CustomerMetricDatum）
 *
 *  ── 資料策略（校驗 2026-05-30）──
 *  GRP12 核心五店 metric 早被 round16/17 seed（parts_direct_sale_amt/_margin/
 *  parts_turnover/parts_deadstock_pct/accessory_install_rate/accessory_margin），
 *  本層「上捲」= helper SUM/AVG 五店；其餘（呆滯金額/6月走勢/品類donut/精品明細/
 *  供應商/單店SKU drill）round20 新 seed（metadata._seed='round20-business-mgmt'）。
 *
 *  ── 資料合約（本層讀的 metric_key）──
 *    集團(org_id=NULL)：parts_deadstock_amt / parts_inventory_value /
 *      accessory_revenue / accessory_units / parts_purchase_total /
 *      parts_inbound_count / parts_outbound_count / parts_count_variance /
 *      parts_vendor_concentration(metadata.vendors[]) /
 *      parts_margin_monthly(6 期) / parts_category_mix(metadata.cat × 4)
 *    門店(org_id=store)：parts_inventory_value / parts_deadstock_amt /
 *      accessory_units / accessory_revenue / accessory_avg_ticket /
 *      accessory_detail(metadata.models[]/top_items[]/items[]) /
 *      parts_margin_monthly(6 期) / parts_category_mix(metadata.cat × 4) /
 *      parts_drill(metadata.warehouses[]/skus[]/purchaseTrend{months,purchase,issue})
 *      + round16/17 既有 parts_direct_sale_amt/_margin/parts_turnover/
 *        parts_deadstock_pct/accessory_install_rate
 *
 *  全部對「無資料」安全：回空陣列 / null，不 throw。
 * ════════════════════════════════════════════════════════════════════════ */

/* ────────────── 共用型別（GRP12） ────────────── */

/** 庫存健康狀態（呆滯率 + 周轉率規則生成）。 */
export type PartsHealthStatus = "ok" | "warn" | "danger";

/** 集團 5 KPI。 */
export type PartsKpis = {
  revenue: number | null; // 零件總營收（SUM 五店 parts_direct_sale_amt）
  marginRate: number | null; // 零件毛利率（AVG 五店 parts_direct_sale_margin）
  turnover: number | null; // 庫存周轉率（AVG 五店 parts_turnover）
  deadstockAmt: number | null; // 呆滯庫存金額（集團 parts_deadstock_amt）
  accessoryRevenue: number | null; // 精品加裝業績（集團 accessory_revenue）
};

/** 門店零件一列（業績對比 + 庫存健康表共用）。 */
export type StorePartsRow = {
  store: StoreLite;
  revenue: number | null;
  marginRate: number | null;
  turnover: number | null;
  inventoryValue: number | null;
  deadstockPct: number | null;
  status: PartsHealthStatus;
};

/** 精品加裝一列（門店 × 業績）。 */
export type AccessoryRow = {
  store: StoreLite;
  units: number | null;
  installRate: number | null;
  revenue: number | null;
  avgTicket: number | null;
  topItems: string[];
};

/** 供應商集中度一列。 */
export type VendorRow = { name: string; sub: string; pct: number };

/** 本月集團快覽 mini-stat。 */
export type PartsMiniStat = {
  label: string;
  value: string;
  tone: "navy" | "green" | "amber" | "red";
};

/** GRP12 集團總覽。 */
export type GroupPartsFinancials = {
  period: string;
  kpis: PartsKpis;
  storeRows: StorePartsRow[];
  categoryMix: CustomerMetricDatum[];
  marginTrend: { months: string[]; values: Array<number | null> };
  vendors: VendorRow[];
  vendorConcentration: number | null; // 前 3 大佔比
  accessoryRows: AccessoryRow[];
  accessoryTotal: {
    units: number | null;
    revenue: number | null;
    avgTicket: number | null;
    installRate: number | null;
  };
  miniStats: PartsMiniStat[];
  alerts: string[];
};

/** 單店 SKU 一筆。 */
export type SkuRow = {
  id: string;
  name: string;
  cat: string;
  qty: number;
  safe: number;
  amt: number;
  lastMove: string;
  age: number;
  status: "normal" | "warn90" | "warn180" | "low";
};

/** 倉庫分佈一列。 */
export type WarehouseRow = { name: string; sku: number; value: number; pct: number };

/** 精品品項排行一列。 */
export type AccessoryItemRow = { name: string; qty: number; rev: number; avg: number; pct: number };

/** GRP12 單店深鑽。 */
export type StorePartsDrilldown = {
  store: StoreLite;
  period: string;
  kpis: {
    revenue: number | null;
    marginRate: number | null;
    turnover: number | null;
    deadstockAmt: number | null;
    deadstockPct: number | null;
    accessoryRevenue: number | null;
  };
  warehouses: WarehouseRow[];
  skus: SkuRow[];
  deadList: SkuRow[]; // age >= 90 子集
  purchaseTrend: { months: string[]; purchase: Array<number | null>; issue: Array<number | null> };
  accessoryItems: AccessoryItemRow[];
  modelAccessory: Array<{ model: string; rate: number }>;
  alerts: string[];
};

/* ────────────── GRP12 內部 loader ────────────── */

/** 讀某 scope（org_id=null 集團 / =store 門店）的 parts_category_mix → Map<cat, value>。 */
async function loadCategoryMix(
  client: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  orgId: string | null,
): Promise<Map<string, number | null>> {
  let q = client
    .from("kpi_snapshots")
    .select("metric_value, metadata")
    .eq("brand_id", brandId)
    .eq("metric_key", "parts_category_mix")
    .is("staff_id", null);
  q = orgId === null ? q.is("org_id", null) : q.eq("org_id", orgId);
  const { data } = await q;
  const map = new Map<string, number | null>();
  for (const r of (data ?? []) as Array<{
    metric_value: number | null;
    metadata: { cat?: string } | null;
  }>) {
    const cat = r.metadata?.cat;
    if (cat) map.set(cat, r.metric_value);
  }
  return map;
}

/** 讀 parts_margin_monthly 月度序列（org_id=null 集團 / =store），舊→新。 */
async function loadMarginTrend(
  client: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  orgId: string | null,
): Promise<{ months: string[]; values: Array<number | null> }> {
  let q = client
    .from("kpi_snapshots")
    .select("period_month, metric_value")
    .eq("brand_id", brandId)
    .eq("metric_key", "parts_margin_monthly")
    .is("staff_id", null);
  q = orgId === null ? q.is("org_id", null) : q.eq("org_id", orgId);
  const { data } = await q.order("period_month", { ascending: true });
  const months: string[] = [];
  const values: Array<number | null> = [];
  for (const r of (data ?? []) as Array<{ period_month: string; metric_value: number | null }>) {
    months.push(normalizeMonth(r.period_month));
    values.push(r.metric_value);
  }
  return { months, values };
}

/** 讀集團供應商集中度（parts_vendor_concentration，metadata.vendors[]）。 */
async function loadVendors(
  client: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
): Promise<{ concentration: number | null; vendors: VendorRow[] }> {
  const { data } = await client
    .from("kpi_snapshots")
    .select("metric_value, metadata")
    .eq("brand_id", brandId)
    .eq("metric_key", "parts_vendor_concentration")
    .is("org_id", null)
    .order("period_month", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as
    | { metric_value: number | null; metadata: { vendors?: VendorRow[] } | null }
    | undefined;
  return { concentration: row?.metric_value ?? null, vendors: row?.metadata?.vendors ?? [] };
}

/** 讀某店 accessory_detail（metadata.models / top_items / items）。 */
async function loadAccessoryDetail(
  client: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  storeId: string,
): Promise<{
  models: Array<{ model: string; rate: number }>;
  topItems: string[];
  items: AccessoryItemRow[];
}> {
  const { data } = await client
    .from("kpi_snapshots")
    .select("metadata")
    .eq("brand_id", brandId)
    .eq("org_id", storeId)
    .eq("metric_key", "accessory_detail")
    .order("period_month", { ascending: false })
    .limit(1);
  const md = (
    (data ?? [])[0] as
      | {
          metadata: {
            models?: Array<{ model: string; rate: number }>;
            top_items?: string[];
            items?: AccessoryItemRow[];
          } | null;
        }
      | undefined
  )?.metadata;
  return { models: md?.models ?? [], topItems: md?.top_items ?? [], items: md?.items ?? [] };
}

/** 讀某店 parts_drill（metadata.warehouses / skus / purchaseTrend）。 */
async function loadPartsDrill(
  client: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  storeId: string,
): Promise<{
  warehouses: WarehouseRow[];
  skus: SkuRow[];
  purchaseTrend: { months: string[]; purchase: number[]; issue: number[] };
}> {
  const { data } = await client
    .from("kpi_snapshots")
    .select("metadata")
    .eq("brand_id", brandId)
    .eq("org_id", storeId)
    .eq("metric_key", "parts_drill")
    .order("period_month", { ascending: false })
    .limit(1);
  const md = (
    (data ?? [])[0] as
      | {
          metadata: {
            warehouses?: WarehouseRow[];
            skus?: SkuRow[];
            purchaseTrend?: { months: string[]; purchase: number[]; issue: number[] };
          } | null;
        }
      | undefined
  )?.metadata;
  return {
    warehouses: md?.warehouses ?? [],
    skus: md?.skus ?? [],
    purchaseTrend: md?.purchaseTrend ?? { months: [], purchase: [], issue: [] },
  };
}

/** 庫存健康狀態：呆滯率 ≥10% 或 周轉 < target 一半=danger；≥5% 或 周轉<target=warn；else ok。 */
function partsHealthStatus(
  deadstockPct: number | null,
  turnover: number | null,
): PartsHealthStatus {
  if (deadstockPct != null && deadstockPct >= 0.1) return "danger";
  if (turnover != null && turnover < PARTS_TURNOVER_TARGET * 0.5) return "danger";
  if (deadstockPct != null && deadstockPct >= PARTS_DEADSTOCK_WARN) return "warn";
  if (turnover != null && turnover < PARTS_TURNOVER_TARGET) return "warn";
  return "ok";
}

/** 平均（忽略 null）；全 null 回 null。 */
function avgOf(vals: Array<number | null>): number | null {
  const ns = vals.filter((v): v is number => v != null && !Number.isNaN(v));
  if (ns.length === 0) return null;
  return ns.reduce((s, v) => s + v, 0) / ns.length;
}

/** 加總（忽略 null）；全 null 回 null。 */
function sumOf(vals: Array<number | null>): number | null {
  const ns = vals.filter((v): v is number => v != null && !Number.isNaN(v));
  if (ns.length === 0) return null;
  return ns.reduce((s, v) => s + v, 0);
}

/** 整數千分位（確定性，無 locale 漂移）。 */
function fmtIntServer(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/* ────────────── (G1) getGroupPartsFinancials（GRP12 集團視圖） ────────────── */

/**
 * 集團零件財務總覽。五店核心 metric SUM/AVG 上捲成集團 KPI + 對比；
 * 呆滯金額/6月走勢/品類donut/供應商/精品明細讀 round20 seed。
 * 無任何門店時回 null。
 */
export async function getGroupPartsFinancials(
  brandId: string,
  opts: { period?: string } = {},
): Promise<GroupPartsFinancials | null> {
  const client = await createClient();
  const stores = await listDiagnosticStores(brandId);
  if (stores.length === 0) return null;

  const { period, metrics: gm } = await loadGroupMetrics(client, brandId, opts.period);
  const periodStr = period ?? opts.period ?? "2026-05-01";

  const storeRows: StorePartsRow[] = [];
  const accessoryRows: AccessoryRow[] = [];
  for (const store of stores) {
    const { metrics: sm } = await loadStoreMetrics(client, brandId, store.id, periodStr || undefined);
    const detail = await loadAccessoryDetail(client, brandId, store.id);
    const deadstockPct = m(sm, "parts_deadstock_pct");
    const turnover = m(sm, "parts_turnover");
    storeRows.push({
      store,
      revenue: m(sm, "parts_direct_sale_amt"),
      marginRate: m(sm, "parts_direct_sale_margin"),
      turnover,
      inventoryValue: m(sm, "parts_inventory_value"),
      deadstockPct,
      status: partsHealthStatus(deadstockPct, turnover),
    });
    accessoryRows.push({
      store,
      units: m(sm, "accessory_units"),
      installRate: m(sm, "accessory_install_rate"),
      revenue: m(sm, "accessory_revenue"),
      avgTicket: m(sm, "accessory_avg_ticket"),
      topItems: detail.topItems,
    });
  }

  const kpis: PartsKpis = {
    revenue: sumOf(storeRows.map((r) => r.revenue)),
    marginRate: avgOf(storeRows.map((r) => r.marginRate)),
    turnover: avgOf(storeRows.map((r) => r.turnover)),
    deadstockAmt: m(gm, "parts_deadstock_amt"),
    accessoryRevenue: m(gm, "accessory_revenue"),
  };

  const catMap = await loadCategoryMix(client, brandId, null);
  const categoryMix: CustomerMetricDatum[] = PARTS_CATEGORIES.map((c) => ({
    ...c,
    value: catMap.get(c.key) ?? null,
  }));

  const marginTrend = await loadMarginTrend(client, brandId, null);
  const { concentration, vendors } = await loadVendors(client, brandId);

  const accessoryTotal = {
    units: m(gm, "accessory_units"),
    revenue: m(gm, "accessory_revenue"),
    avgTicket: (() => {
      const u = m(gm, "accessory_units");
      const r = m(gm, "accessory_revenue");
      return u && u > 0 && r != null ? Math.round(r / u) : null;
    })(),
    installRate: avgOf(accessoryRows.map((a) => a.installRate)),
  };

  const avgDead = avgOf(storeRows.map((r) => r.deadstockPct));
  const miniStats: PartsMiniStat[] = [
    { label: "採購總額", value: fmtIntServer(m(gm, "parts_purchase_total")), tone: "amber" },
    {
      label: "入庫筆數",
      value: m(gm, "parts_inbound_count") != null ? String(m(gm, "parts_inbound_count")) : "—",
      tone: "navy",
    },
    {
      label: "出庫筆數",
      value: m(gm, "parts_outbound_count") != null ? String(m(gm, "parts_outbound_count")) : "—",
      tone: "navy",
    },
    {
      label: "呆滯率",
      value: avgDead != null ? `${(avgDead * 100).toFixed(1)}%` : "—",
      tone: avgDead != null && avgDead > PARTS_DEADSTOCK_WARN ? "red" : "green",
    },
    {
      label: "精品件數",
      value: m(gm, "accessory_units") != null ? String(m(gm, "accessory_units")) : "—",
      tone: "green",
    },
    { label: "盤點差異", value: fmtIntServer(m(gm, "parts_count_variance")), tone: "amber" },
  ];

  const alerts: string[] = [];
  const worstDead = [...storeRows].sort((a, b) => (b.deadstockPct ?? 0) - (a.deadstockPct ?? 0))[0];
  if (worstDead && (worstDead.deadstockPct ?? 0) >= 0.1) {
    alerts.push(
      `${worstDead.store.name}：呆滯率 ${((worstDead.deadstockPct ?? 0) * 100).toFixed(1)}%，呆滯庫存偏高，建議促銷消化`,
    );
  }
  if (concentration != null && concentration >= 60) {
    alerts.push(`採購集中度偏高：前 3 大供應商佔比 ${concentration}%，建議評估備用供應商`);
  }
  const worstTurn = [...storeRows]
    .filter((r) => r.turnover != null)
    .sort((a, b) => (a.turnover ?? 0) - (b.turnover ?? 0))[0];
  if (worstTurn && (worstTurn.turnover ?? 0) < PARTS_TURNOVER_TARGET) {
    alerts.push(
      `${worstTurn.store.name}：庫存周轉率 ${worstTurn.turnover} 次/年，低於目標 ${PARTS_TURNOVER_TARGET}，建議檢視採購頻率`,
    );
  }

  return {
    period: periodStr,
    kpis,
    storeRows,
    categoryMix,
    marginTrend,
    vendors,
    vendorConcentration: concentration,
    accessoryRows,
    accessoryTotal,
    miniStats,
    alerts,
  };
}

/* ────────────── (G2) getStorePartsDrilldown（GRP12 單店深鑽） ────────────── */

/**
 * 單店零件財務明細。KPI 讀該店當期 scalar；SKU/倉庫/採購出庫趨勢讀 parts_drill；
 * 精品品項/車型加裝率讀 accessory_detail。呆滯清單 = SKU age>=90 子集（規則衍生）。
 * 門店不存在或無 drill seed 回 null。
 */
export async function getStorePartsDrilldown(
  brandId: string,
  storeId: string,
  opts: { period?: string } = {},
): Promise<StorePartsDrilldown | null> {
  const client = await createClient();
  const stores = await listDiagnosticStores(brandId);
  const store = stores.find((s) => s.id === storeId);
  if (!store) return null;

  const { period, metrics: sm } = await loadStoreMetrics(client, brandId, storeId, opts.period);
  const periodStr = period ?? opts.period ?? "2026-05-01";

  const drill = await loadPartsDrill(client, brandId, storeId);
  const detail = await loadAccessoryDetail(client, brandId, storeId);
  if (drill.skus.length === 0 && sm.size === 0) return null;

  const deadList = drill.skus.filter((s) => s.age >= 90);
  const deadstockPct = m(sm, "parts_deadstock_pct");
  const turnover = m(sm, "parts_turnover");

  const alerts: string[] = [];
  const dead180 = drill.skus.filter((s) => s.status === "warn180");
  if (dead180.length > 0) {
    alerts.push(`${dead180.length} 項 SKU 呆滯超過 180 天，建議促銷消化或退回原廠`);
  }
  const lowStock = drill.skus.filter((s) => s.status === "low");
  if (lowStock.length > 0) {
    alerts.push(`安全庫存不足：${lowStock.map((s) => s.name).join("、")}，建議補貨`);
  }
  if (turnover != null && turnover < PARTS_TURNOVER_TARGET) {
    alerts.push(`庫存周轉率 ${turnover} 次/年偏低（目標 ${PARTS_TURNOVER_TARGET}），建議檢視採購頻率`);
  }

  return {
    store,
    period: periodStr,
    kpis: {
      revenue: m(sm, "parts_direct_sale_amt"),
      marginRate: m(sm, "parts_direct_sale_margin"),
      turnover,
      deadstockAmt: m(sm, "parts_deadstock_amt"),
      deadstockPct,
      accessoryRevenue: m(sm, "accessory_revenue"),
    },
    warehouses: drill.warehouses,
    skus: drill.skus,
    deadList,
    purchaseTrend: {
      months: drill.purchaseTrend.months,
      purchase: drill.purchaseTrend.purchase,
      issue: drill.purchaseTrend.issue,
    },
    accessoryItems: detail.items,
    modelAccessory: detail.models,
    alerts,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 *  第二十三輪 — 集團管理收尾（GRP15 技師效率診斷 / GRP19 中古車能效）
 *
 *  GRP15：技師個人效率（每點=技師）。「能算就算、算不出讀 seed」：
 *    - 即時：月接單台數（repair_orders.lead_technician_id 聚合）
 *    - seed（kpi_snapshots, staff_role='tech'）：labor_efficiency / rework_rate /
 *      on_time_rate / tenure_years / monthly_intake；門店由 seed 的 org_id 帶
 *      （indian 技師主檔皆掛功能別「維修部」、無真實門店分派 → demo 用 seed org_id
 *       分散到 5 店，不動 employee 主檔）。
 *  GRP19：門店中古車業務（每點=門店、圓圈大小=現有庫存）。全真資料驅動，
 *    自 used_car_inventory 聚合（收購量/售出量/價差率/毛利率/翻車天數/庫存/滯銷率）。
 *
 *  全部對「無資料」安全：回空陣列 / null，不 throw。
 * ════════════════════════════════════════════════════════════════════════ */

const TECH_ROLES = ["technician"];

/** GRP15 技師效率 per-staff。 */
export type TechEffStaff = {
  staff_id: string;
  name: string;
  store: string | null;
  /** 月接單台數（repair_orders 即時；無單讀 seed monthly_intake） */
  intake_count: number;
  /** 工時效率 0..1（seed） */
  labor_efficiency: number | null;
  /** 返修率 0..1（seed；>0.08 標紅 + 告警橫幅） */
  rework_rate: number | null;
  /** 完工準時率 0..1（seed） */
  on_time_rate: number | null;
  /** 技師年資（年；seed tenure_years） */
  tenure_years: number | null;
  /** 綜合評級（A/B/C/D，由 tag 對映） */
  grade: string;
  /** 診斷分類 */
  tag: EfficiencyTag;
};

/** 技師診斷：高返修=危險、高效率低返修=明星、低效率或偏高返修=待輔導。 */
function classifyTech(eff: number | null, rework: number | null): EfficiencyTag {
  if (eff === null || rework === null) return "neutral";
  if (rework > 0.08) return "danger";
  if (eff >= 0.85 && rework <= 0.05) return "star";
  if (eff < 0.7 || rework > 0.06) return "watch";
  return "neutral";
}

const TAG_GRADE: Record<EfficiencyTag, string> = {
  star: "A",
  watch: "C",
  danger: "D",
  neutral: "B",
};

/**
 * GRP15 技師效率散佈圖：回每位在職技師一筆（排除 owner 兼任）。
 * 門店由 seed 的 org_id 解析（→ organizations.name）。無資料安全。
 */
export async function getTechEfficiencyScatter(
  brandId: string,
  opts: ScatterOptions = {},
): Promise<TechEffStaff[]> {
  const client = await createClient();
  const rollingMonths = opts.rollingMonths ?? 3;
  const since = rollingWindowStart(rollingMonths);

  const employees = (await listActiveEmployees(client, brandId, TECH_ROLES)).filter(
    (e) => !(e.role_codes ?? []).includes("owner"),
  );
  if (employees.length === 0) return [];
  const ids = employees.map((e) => e.id);

  // 技師 seed（含 org_id 以解析門店）；client 端取每 (staff, metric) 最新 period
  const { data: seedRows } = await client
    .from("kpi_snapshots")
    .select("staff_id, org_id, period_month, metric_key, metric_value")
    .eq("brand_id", brandId)
    .eq("staff_role", "tech")
    .in("staff_id", ids)
    .order("period_month", { ascending: false });

  type Seed = { orgId: string | null; metrics: Map<string, number | null> };
  const seedByStaff = new Map<string, Seed>();
  const seen = new Set<string>();
  for (const row of (seedRows ?? []) as Array<{
    staff_id: string | null;
    org_id: string | null;
    metric_key: string;
    metric_value: number | null;
  }>) {
    if (!row.staff_id) continue;
    let s = seedByStaff.get(row.staff_id);
    if (!s) {
      s = { orgId: row.org_id, metrics: new Map() };
      seedByStaff.set(row.staff_id, s);
    }
    const k = `${row.staff_id}|${row.metric_key}`;
    if (seen.has(k)) continue;
    seen.add(k);
    s.metrics.set(row.metric_key, row.metric_value);
  }

  // 由 seed org_id 解析門店名
  const orgIds = [
    ...new Set([...seedByStaff.values()].map((s) => s.orgId).filter(Boolean) as string[]),
  ];
  const storeNames = new Map<string, string>();
  if (orgIds.length > 0) {
    const { data: orgs } = await client
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    for (const o of (orgs ?? []) as Array<{ id: string; name: string }>) {
      storeNames.set(o.id, o.name);
    }
  }

  // 即時：repair_orders 依 lead_technician_id 聚合接單台數
  const { data: roRows } = await client
    .from("repair_orders")
    .select("lead_technician_id, opened_at")
    .eq("brand_id", brandId)
    .gte("opened_at", since);
  const roByTech = new Map<string, number>();
  for (const r of (roRows ?? []) as Array<{ lead_technician_id: string | null }>) {
    if (!r.lead_technician_id) continue;
    roByTech.set(r.lead_technician_id, (roByTech.get(r.lead_technician_id) ?? 0) + 1);
  }

  return employees.map((e) => {
    const seed = seedByStaff.get(e.id);
    const metrics = seed?.metrics ?? new Map<string, number | null>();
    const eff = metrics.get("labor_efficiency") ?? null;
    const rework = metrics.get("rework_rate") ?? null;
    const liveIntake = roByTech.get(e.id) ?? 0;
    const seedIntake = metrics.get("monthly_intake");
    const intake = liveIntake > 0 ? liveIntake : (seedIntake ?? 0);
    const tag = classifyTech(eff, rework);
    return {
      staff_id: e.id,
      name: e.name,
      store: seed?.orgId ? (storeNames.get(seed.orgId) ?? null) : null,
      intake_count: intake,
      labor_efficiency: eff,
      rework_rate: rework,
      on_time_rate: metrics.get("on_time_rate") ?? null,
      tenure_years: metrics.get("tenure_years") ?? null,
      grade: TAG_GRADE[tag],
      tag,
    };
  });
}

/* ────────────── GRP19 中古車能效 ────────────── */

/** GRP19 門店中古車能效 per-store。 */
export type UsedCarStoreEff = {
  store_id: string;
  store: string;
  /** 本季收購台數 */
  acquired_count: number;
  /** 本季售出台數 */
  sold_count: number;
  /** 收購價差率 0..1（(售價-收購價)/收購價 均值） */
  spread_rate: number | null;
  /** 售出毛利率 0..1（margin/listing_price 均值，售出車） */
  margin_rate: number | null;
  /** 平均翻車天數（售出=售出-收購；在庫=今日-收購） */
  turnover_days: number | null;
  /** 現有庫存台數（非 sold）→ 圓圈大小 */
  inventory_count: number;
  /** 滯銷率 0..1（在庫且 > 60 天 / 庫存） */
  deadstock_rate: number | null;
  tag: EfficiencyTag;
};

/** GRP19 庫存清單一列。 */
export type UsedCarInventoryItem = {
  id: string;
  store: string | null;
  license_plate: string | null;
  model_display_name: string | null;
  year: number | null;
  mileage_km: number | null;
  acquisition_price: number | null;
  listing_price: number | null;
  acquisition_date: string | null;
  sold_date: string | null;
  status: string | null;
  condition_grade: string | null;
  /** 在庫天數（售出=售出-收購；在庫=今日-收購） */
  days_in_stock: number | null;
};

type UsedCarRow = {
  id: string;
  organization_id: string | null;
  license_plate: string | null;
  model_display_name: string | null;
  year: number | null;
  mileage_km: number | null;
  acquisition_price: number | null;
  listing_price: number | null;
  margin: number | null;
  acquisition_date: string | null;
  sold_date: string | null;
  status: string | null;
  condition_grade: string | null;
};

const USED_CAR_DEAD_DAYS = 60;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

/** 中古車門店診斷：滯銷率高=危險、高毛利量大=明星、低毛利=待輔導。 */
function classifyUsedCar(
  marginRate: number | null,
  acquired: number,
  deadRate: number | null,
): EfficiencyTag {
  if (deadRate != null && deadRate > 0.4) return "danger";
  if (marginRate == null) return "neutral";
  if (marginRate >= 0.11 && acquired >= 5) return "star";
  if (marginRate < 0.09) return "watch";
  return "neutral";
}

/**
 * GRP19 中古車能效散佈圖：每門店一筆，全真資料聚合自 used_car_inventory。無資料安全。
 */
export async function getUsedCarEfficiency(
  brandId: string,
  opts: ScatterOptions = {},
): Promise<UsedCarStoreEff[]> {
  const client = await createClient();
  const rollingMonths = opts.rollingMonths ?? 3;
  const since = rollingWindowStart(rollingMonths);
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data } = await client
    .from("used_car_inventory")
    .select(
      "id, organization_id, acquisition_price, listing_price, margin, acquisition_date, sold_date, status",
    )
    .eq("brand_id", brandId);
  const rows = (data ?? []) as UsedCarRow[];
  if (rows.length === 0) return [];

  const stores = await listDiagnosticStores(brandId);
  const storeName = new Map(stores.map((s) => [s.id, s.name] as const));

  const byOrg = new Map<string, UsedCarRow[]>();
  for (const r of rows) {
    if (!r.organization_id) continue;
    const arr = byOrg.get(r.organization_id) ?? [];
    arr.push(r);
    byOrg.set(r.organization_id, arr);
  }

  const out: UsedCarStoreEff[] = [];
  for (const [orgId, list] of byOrg) {
    const acquired = list.filter((r) => r.acquisition_date && r.acquisition_date >= since);
    const sold = list.filter((r) => r.sold_date && r.sold_date >= since);
    const inStock = list.filter((r) => r.status !== "sold");

    const spreads = acquired
      .filter((r) => r.acquisition_price && r.listing_price && r.acquisition_price > 0)
      .map((r) => (r.listing_price! - r.acquisition_price!) / r.acquisition_price!);
    const spread_rate = spreads.length
      ? spreads.reduce((a, b) => a + b, 0) / spreads.length
      : null;

    const margins = sold
      .filter((r) => r.margin != null && r.listing_price && r.listing_price > 0)
      .map((r) => r.margin! / r.listing_price!);
    const margin_rate = margins.length
      ? margins.reduce((a, b) => a + b, 0) / margins.length
      : null;

    const turns = list
      .filter((r) => r.acquisition_date)
      .map((r) => daysBetween(r.acquisition_date!, r.sold_date ?? todayStr));
    const turnover_days = turns.length ? turns.reduce((a, b) => a + b, 0) / turns.length : null;

    const dead = inStock.filter(
      (r) => r.acquisition_date && daysBetween(r.acquisition_date, todayStr) > USED_CAR_DEAD_DAYS,
    ).length;
    const deadstock_rate = inStock.length ? dead / inStock.length : null;

    out.push({
      store_id: orgId,
      store: storeName.get(orgId) ?? "未分配門店",
      acquired_count: acquired.length,
      sold_count: sold.length,
      spread_rate,
      margin_rate,
      turnover_days,
      inventory_count: inStock.length,
      deadstock_rate,
      tag: classifyUsedCar(margin_rate, acquired.length, deadstock_rate),
    });
  }
  return out.sort((a, b) => a.store.localeCompare(b.store, "zh-Hant"));
}

/**
 * GRP19 中古車庫存清單。可選 orgId 過濾單店；含已售出與在庫。無資料回空陣列。
 */
export async function listUsedCarInventory(
  brandId: string,
  orgId?: string,
): Promise<UsedCarInventoryItem[]> {
  const client = await createClient();
  const todayStr = new Date().toISOString().slice(0, 10);
  let q = client
    .from("used_car_inventory")
    .select(
      "id, organization_id, license_plate, model_display_name, year, mileage_km, acquisition_price, listing_price, acquisition_date, sold_date, status, condition_grade",
    )
    .eq("brand_id", brandId)
    .order("acquisition_date", { ascending: false });
  if (orgId) q = q.eq("organization_id", orgId);
  const { data } = await q;
  const rows = (data ?? []) as UsedCarRow[];

  const stores = await listDiagnosticStores(brandId);
  const storeName = new Map(stores.map((s) => [s.id, s.name] as const));

  return rows.map((r) => ({
    id: r.id,
    store: r.organization_id ? (storeName.get(r.organization_id) ?? null) : null,
    license_plate: r.license_plate,
    model_display_name: r.model_display_name,
    year: r.year,
    mileage_km: r.mileage_km,
    acquisition_price: r.acquisition_price,
    listing_price: r.listing_price,
    acquisition_date: r.acquisition_date,
    sold_date: r.sold_date,
    status: r.status,
    condition_grade: r.condition_grade,
    days_in_stock: r.acquisition_date
      ? daysBetween(r.acquisition_date, r.sold_date ?? todayStr)
      : null,
  }));
}

/* ────────────── GRP03 銷售目標監看（G1，2026-06-01）────────────── */

export type SalesTargetRow = {
  orgId: string;
  storeName: string;
  target: number | null; // 月目標（台）
  actual: number | null; // 當期累計成交（台）
  achievementRate: number | null; // 達成率（0~1+）
};

/**
 * GRP03 逐店銷售目標總覽：最新一期 sales_volume_target / sales_volume / achievement_rate。
 * 給 Pace 配速計算器自動帶入「月目標 / 今日累計」初值（Phase 1 仍可手動覆寫）。
 * 天條：本 helper 內部走 createClient（RLS scope），UI 不直連。
 */
export async function getSalesTargetOverview(brandId: string): Promise<SalesTargetRow[]> {
  const client = await createClient();
  const { data: latestRow } = await client
    .from("kpi_snapshots")
    .select("period_month")
    .eq("brand_id", brandId)
    .eq("metric_key", "achievement_rate")
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle();
  const period = (latestRow as { period_month: string } | null)?.period_month ?? null;
  if (!period) return [];

  // kpi_snapshots.org_id 無 FK → 不能 PostgREST embed organizations，門店名另查 map
  const [{ data }, { data: orgData }] = await Promise.all([
    client
      .from("kpi_snapshots")
      .select("org_id, metric_key, metric_value, period_month")
      .eq("brand_id", brandId)
      .in("metric_key", ["sales_volume_target", "sales_volume", "achievement_rate"])
      .not("org_id", "is", null),
    client.from("organizations").select("id, name").eq("brand_id", brandId),
  ]);
  const nameById = new Map(
    ((orgData ?? []) as Array<{ id: string; name: string | null }>).map((o) => [o.id, o.name ?? o.id]),
  );

  type Row = {
    org_id: string;
    metric_key: string;
    metric_value: number | null;
    period_month: string;
  };
  const rows = (data ?? []) as Row[];
  const byOrg = new Map<string, SalesTargetRow & { _tp: string; _ta: string }>();
  for (const r of rows) {
    const cur =
      byOrg.get(r.org_id) ??
      ({ orgId: r.org_id, storeName: nameById.get(r.org_id) ?? r.org_id, target: null, actual: null, achievementRate: null, _tp: "", _ta: "" } as SalesTargetRow & { _tp: string; _ta: string });
    // achievement_rate 鎖最新期；target/actual 取各自最新期（demo 期別不一致）
    if (r.metric_key === "achievement_rate" && r.period_month === period) cur.achievementRate = r.metric_value;
    if (r.metric_key === "sales_volume_target" && r.period_month > cur._tp) { cur.target = r.metric_value; cur._tp = r.period_month; }
    if (r.metric_key === "sales_volume" && r.period_month > cur._ta) { cur.actual = r.metric_value; cur._ta = r.period_month; }
    byOrg.set(r.org_id, cur);
  }
  return [...byOrg.values()]
    .map(({ _tp, _ta, ...row }) => row)
    .sort((a, b) => (b.achievementRate ?? 0) - (a.achievementRate ?? 0));
}

/* ────────────── GRP01 集團總覽（G1，2026-06-01）────────────── */

export type GroupStoreSummary = {
  orgId: string;
  name: string;
  health: number | null;       // 健康分（0~100）
  achievement: number | null;  // 銷售達成率（0~1+）
  nps: number | null;          // 門店 NPS
};

export type GroupOverview = {
  healthAvg: number | null;
  groupNps: number | null;
  achievementAvg: number | null;
  storeCount: number;
  stores: GroupStoreSummary[];
};

/**
 * GRP01 集團總覽：集團主管每日首頁。集團層 KPI（門店彙總）+ 逐店摘要供下鑽。
 * 下鑽目標頁 GRP09 門店銷售 / GRP10 門店售後皆已是真頁（?store=orgId）。
 * 天條：helper 內部 createClient（RLS scope），UI 不直連。
 * 注意：kpi_snapshots.org_id 無 FK → 不可 embed organizations，門店名另查。
 */
export async function getGroupOverview(brandId: string): Promise<GroupOverview> {
  const client = await createClient();
  const [{ data: kpi }, { data: orgData }, { data: gNps }] = await Promise.all([
    client
      .from("kpi_snapshots")
      .select("org_id, metric_key, metric_value, period_month")
      .eq("brand_id", brandId)
      .in("metric_key", ["health_score", "achievement_rate", "store_nps"])
      .not("org_id", "is", null),
    client.from("organizations").select("id, name").eq("brand_id", brandId),
    client
      .from("kpi_snapshots")
      .select("metric_value")
      .eq("brand_id", brandId)
      .eq("metric_key", "group_nps")
      .is("org_id", null)
      .order("period_month", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const nameById = new Map(
    ((orgData ?? []) as Array<{ id: string; name: string | null }>).map((o) => [o.id, o.name ?? o.id]),
  );
  type K = { org_id: string; metric_key: string; metric_value: number | null; period_month: string };
  const latestByKey = new Map<string, { v: number | null; p: string }>(); // org::metric → 最新
  for (const r of (kpi ?? []) as K[]) {
    const k = `${r.org_id}::${r.metric_key}`;
    const cur = latestByKey.get(k);
    if (!cur || r.period_month > cur.p) latestByKey.set(k, { v: r.metric_value, p: r.period_month });
  }
  const orgIds = [...new Set(((kpi ?? []) as K[]).map((r) => r.org_id))];
  const stores: GroupStoreSummary[] = orgIds
    .map((id) => ({
      orgId: id,
      name: nameById.get(id) ?? id,
      health: latestByKey.get(`${id}::health_score`)?.v ?? null,
      achievement: latestByKey.get(`${id}::achievement_rate`)?.v ?? null,
      nps: latestByKey.get(`${id}::store_nps`)?.v ?? null,
    }))
    .sort((a, b) => (b.health ?? 0) - (a.health ?? 0));

  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  return {
    healthAvg: avg(stores.map((s) => s.health)),
    groupNps: (gNps as { metric_value: number | null } | null)?.metric_value ?? null,
    achievementAvg: avg(stores.map((s) => s.achievement)),
    storeCount: stores.length,
    stores,
  };
}

/* ────────────── GRP02 BSC 計分卡（2026-06-01）────────────── */

/** BSC 一個門店的計分列：六大面向分數 + 綜合健康分 + 達成率。 */
export type BscStoreRow = {
  orgId: string;
  name: string;
  /** 六大面向分數（各 0~100；缺回 null） */
  dims: Record<HealthDim, number | null>;
  /** 綜合健康分（health_score，0~100；缺回六維均值 fallback） */
  total: number | null;
  /** 銷售達成率（0~1+） */
  achievement: number | null;
};

/** BSC 集團層彙總（六面向跨店均值 + 綜合健康分均值 + 集團 NPS）。 */
export type BscScorecard = {
  /** 各面向集團均值（跨店平均，缺回 null） */
  dimAvg: Record<HealthDim, number | null>;
  /** 綜合健康分集團均值 */
  healthAvg: number | null;
  /** 集團 NPS */
  groupNps: number | null;
  /** 門店數 */
  storeCount: number;
  /** 逐店計分列（綜合分高→低排序） */
  stores: BscStoreRow[];
};

/**
 * GRP02 BSC 計分卡：六大面向（銷售/售後/零件/人才/客戶滿意/財務）平衡計分卡。
 * 集團層六面向均值 + 綜合健康分 + 集團 NPS，逐店一列六面向分數。
 *
 * 資料策略沿用 getGroupOverview：org_id=門店、staff_id NULL 的門店層 dim_* / health_score
 * / achievement_rate 各取最新期；集團 NPS 讀 org_id=NULL 的 group_nps 最新一筆。
 * 天條：helper 內部 createClient（RLS scope），UI 不直連。
 * 注意：kpi_snapshots.org_id 無 FK → 不可 embed organizations，門店名另查 Map。
 */
export async function getBscScorecard(brandId: string): Promise<BscScorecard> {
  const client = await createClient();
  const [{ data: kpi }, { data: orgData }, { data: gNps }] = await Promise.all([
    client
      .from("kpi_snapshots")
      .select("org_id, metric_key, metric_value, period_month")
      .eq("brand_id", brandId)
      .in("metric_key", [...HEALTH_DIMS, "health_score", "achievement_rate"])
      .not("org_id", "is", null),
    client.from("organizations").select("id, name").eq("brand_id", brandId),
    client
      .from("kpi_snapshots")
      .select("metric_value")
      .eq("brand_id", brandId)
      .eq("metric_key", "group_nps")
      .is("org_id", null)
      .order("period_month", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const nameById = new Map(
    ((orgData ?? []) as Array<{ id: string; name: string | null }>).map((o) => [o.id, o.name ?? o.id]),
  );
  type K = { org_id: string; metric_key: string; metric_value: number | null; period_month: string };
  // org::metric → 最新期值
  const latestByKey = new Map<string, { v: number | null; p: string }>();
  for (const r of (kpi ?? []) as K[]) {
    const k = `${r.org_id}::${r.metric_key}`;
    const cur = latestByKey.get(k);
    if (!cur || r.period_month > cur.p) latestByKey.set(k, { v: r.metric_value, p: r.period_month });
  }

  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };

  const orgIds = [...new Set(((kpi ?? []) as K[]).map((r) => r.org_id))];
  const stores: BscStoreRow[] = orgIds
    .map((id) => {
      const dims = Object.fromEntries(
        HEALTH_DIMS.map((d) => [d, latestByKey.get(`${id}::${d}`)?.v ?? null]),
      ) as Record<HealthDim, number | null>;
      // 綜合分優先讀 health_score，缺則六維均值 fallback
      const total = latestByKey.get(`${id}::health_score`)?.v ?? avg(HEALTH_DIMS.map((d) => dims[d]));
      return {
        orgId: id,
        name: nameById.get(id) ?? id,
        dims,
        total,
        achievement: latestByKey.get(`${id}::achievement_rate`)?.v ?? null,
      };
    })
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

  const dimAvg = Object.fromEntries(
    HEALTH_DIMS.map((d) => [d, avg(stores.map((s) => s.dims[d]))]),
  ) as Record<HealthDim, number | null>;

  return {
    dimAvg,
    healthAvg: avg(stores.map((s) => s.total)),
    groupNps: (gNps as { metric_value: number | null } | null)?.metric_value ?? null,
    storeCount: stores.length,
    stores,
  };
}

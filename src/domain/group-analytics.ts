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
    .from("sales_leads")
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

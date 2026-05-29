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

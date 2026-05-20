"use server";

/**
 * Domain Helper — Aftersales Staff（售後服務部門員工名冊）
 *
 * 設計稿：07_售後管理模組_v2.html → Tab A 員工人員名冊
 * 路由：/parts/aftersales/management/staff
 *
 * 紀律：
 *  - 沿用 employees 主表（不另建 aftersales_staff 表）
 *  - 售後特有屬性放 metadata jsonb（grade / work_type / final_inspection_auth / system_account）
 *  - 預設 filter 限定「維修部 + 零配件部」當作「售後服務部門」
 *  - UI 永遠透過此 helper，不直連 supabase
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  AFTERSALES_STAFF_PAGE_SIZE_DEFAULT,
  type AftersalesStaffMetadata,
} from "./aftersales-staff.constants";

export type AftersalesStaffRow = {
  id: string;
  brand_id: string;
  emp_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  dept_id: string | null;
  dept_name: string | null;
  dept_code: string | null;
  position: string | null;
  hire_date: string | null;
  leave_date: string | null;
  employment_status: string;
  is_active: boolean;
  notes: string | null;
  avatar_url: string | null;
  // 售後 metadata 拆出來給 UI 直接用
  grade: string | null;
  work_type: string | null;
  final_inspection_auth: boolean;
  system_account: string | null;
  metadata: AftersalesStaffMetadata;
  created_at: string;
  updated_at: string;
};

export type AftersalesDepartmentOption = {
  id: string;
  name: string;
  code: string | null;
};

export type AftersalesStaffFilters = {
  q?: string;
  grade?: string;
  dept?: string;
  status?: "all" | "active" | "inactive";
  auth?: "all" | "yes" | "no";
};

/* ────────────── KPI types ────────────── */

export type AftersalesStaffKpi = {
  emp_id: string;
  /** 累計 RO 筆數（員工作為 SA 的 RO 總數） */
  ro_count_total: number;
  /** 本月 RO 筆數（依 opened_at 月份） */
  ro_count_month: number;
  /** 本月業績金額（員工作為 SA 的 lines_total 加總） */
  monthly_revenue: number;
  /** NPS 平均分（被分派為負責人的 nps_responses.score 平均，0-10） */
  nps_avg: number | null;
  /** NPS 樣本數 */
  nps_count: number;
  /** CSAT — 取 NPS >=9 的比例 (推薦比例)，0-100，沒樣本回 null */
  csat_pct: number | null;
};

export type AftersalesStaffRowWithKpi = AftersalesStaffRow & {
  kpi: AftersalesStaffKpi;
};

export type AftersalesStaffSummaryKpi = {
  /** 售後部門總人數（含離職） */
  headcount: number;
  /** 在職人數 */
  active_count: number;
  /** 持有竣工複檢授權人數 */
  auth_count: number;
  /** 本月累計 RO 數 */
  ro_count_month: number;
  /** 本月業績金額 */
  monthly_revenue: number;
  /** 售後 NPS 平均（過去 90 天） */
  nps_avg: number | null;
  /** 售後 NPS 樣本數（過去 90 天） */
  nps_count: number;
  /** 各職級人數 */
  grade_distribution: Record<string, number>;
};

/* ────────────── helpers ────────────── */

/** 把售後相關部門挑出來（code SVC / PRT 或 name 含「維修」「零配件」「售後」） */
function isAftersalesDept(d: { code: string | null; name: string }): boolean {
  if (d.code && ["SVC", "PRT", "AFT"].includes(d.code.toUpperCase())) return true;
  return /維修|零配件|零件|售後/.test(d.name);
}

function pickMetadata(meta: unknown): AftersalesStaffMetadata {
  if (!meta || typeof meta !== "object") return {};
  return meta as AftersalesStaffMetadata;
}

function rowFromDb(
  row: Record<string, unknown>,
  deptMap: Map<string, AftersalesDepartmentOption>,
): AftersalesStaffRow {
  const meta = pickMetadata(row.metadata);
  const dept = row.dept_id ? deptMap.get(row.dept_id as string) ?? null : null;
  return {
    id: row.id as string,
    brand_id: row.brand_id as string,
    emp_code: row.emp_code as string,
    name: row.name as string,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    dept_id: (row.dept_id as string | null) ?? null,
    dept_name: dept?.name ?? null,
    dept_code: dept?.code ?? null,
    position: (row.position as string | null) ?? null,
    hire_date: (row.hire_date as string | null) ?? null,
    leave_date: (row.leave_date as string | null) ?? null,
    employment_status: (row.employment_status as string) ?? "active",
    is_active: Boolean(row.is_active ?? true),
    notes: (row.notes as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    grade: (meta.grade as string | null) ?? null,
    work_type: (meta.work_type as string | null) ?? null,
    final_inspection_auth: Boolean(meta.final_inspection_auth),
    system_account: (meta.system_account as string | null) ?? null,
    metadata: meta,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/* ────────────── Read ────────────── */

/** 列出當前 brand 的售後服務部門（維修+零配件） */
export async function listAftersalesDepartments(): Promise<AftersalesDepartmentOption[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("departments")
    .select("id, name, code")
    .eq("brand_id", brand)
    .order("name");
  if (error) return [];
  return ((data ?? []) as Array<{ id: string; name: string; code: string | null }>)
    .filter(isAftersalesDept)
    .map((d) => ({ id: d.id, name: d.name, code: d.code }));
}

/**
 * 列出售後員工。預設只回維修+零配件部門員工；filters.dept='all-depts' 可看全部
 * （含未指派部門者）— 給後台 admin 查漏用。
 */
export async function listAftersalesStaff(
  filters: AftersalesStaffFilters = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: AftersalesStaffRow[]; totalCount: number }> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(
    1,
    options.pageSize ?? AFTERSALES_STAFF_PAGE_SIZE_DEFAULT,
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // 拿可用售後部門（filter 與 row 顯示都要用）
  const aftersalesDepts = await listAftersalesDepartments();
  const aftersalesDeptIds = new Set(aftersalesDepts.map((d) => d.id));
  const deptMap = new Map(aftersalesDepts.map((d) => [d.id, d]));

  let q = supabase
    .from("employees")
    .select(
      "id, brand_id, emp_code, name, email, phone, dept_id, position, hire_date, leave_date, employment_status, is_active, notes, avatar_url, metadata, created_at, updated_at",
      { count: "exact" },
    )
    .eq("brand_id", brand);

  // dept filter
  if (filters.dept && filters.dept !== "all" && filters.dept !== "all-depts") {
    if (!aftersalesDeptIds.has(filters.dept)) {
      // filter 給的不是售後部門 → 回空
      return { rows: [], totalCount: 0 };
    }
    q = q.eq("dept_id", filters.dept);
  } else if (filters.dept !== "all-depts") {
    // 預設只看售後服務部門
    if (aftersalesDeptIds.size === 0) {
      return { rows: [], totalCount: 0 };
    }
    q = q.in("dept_id", Array.from(aftersalesDeptIds));
  }

  if (filters.status === "active") q = q.eq("is_active", true);
  if (filters.status === "inactive") q = q.eq("is_active", false);

  if (filters.q?.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(`name.ilike.%${t}%,emp_code.ilike.%${t}%,position.ilike.%${t}%`);
  }

  // grade / auth 走 metadata jsonb：postgrest 支援 ->>，給 cs/eq
  if (filters.grade && filters.grade !== "all") {
    q = q.eq("metadata->>grade", filters.grade);
  }
  if (filters.auth === "yes") q = q.eq("metadata->>final_inspection_auth", "true");
  if (filters.auth === "no") q = q.or(
    "metadata->>final_inspection_auth.is.null,metadata->>final_inspection_auth.eq.false",
  );

  const { data, count, error } = await q
    .order("emp_code", { ascending: true })
    .range(from, to);
  if (error) throw new Error(`listAftersalesStaff: ${error.message}`);

  const rows = (data ?? []).map((r) =>
    rowFromDb(r as Record<string, unknown>, deptMap),
  );
  return { rows, totalCount: count ?? 0 };
}

export async function getAftersalesStaffById(
  id: string,
): Promise<AftersalesStaffRow | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("employees")
    .select(
      "id, brand_id, emp_code, name, email, phone, dept_id, position, hire_date, leave_date, employment_status, is_active, notes, avatar_url, metadata, created_at, updated_at",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error || !data) return null;

  const aftersalesDepts = await listAftersalesDepartments();
  const deptMap = new Map(aftersalesDepts.map((d) => [d.id, d]));
  return rowFromDb(data as Record<string, unknown>, deptMap);
}

/* ────────────── KPI 計算 ────────────── */

/** 列出當前 brand 售後員工 + 每位 KPI（給卡片 grid / DataGrid 用） */
export async function listAftersalesStaffWithKpi(
  filters: AftersalesStaffFilters = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{
  rows: AftersalesStaffRowWithKpi[];
  totalCount: number;
  summary: AftersalesStaffSummaryKpi;
}> {
  const { rows, totalCount } = await listAftersalesStaff(filters, options);
  if (rows.length === 0) {
    return {
      rows: [],
      totalCount,
      summary: {
        headcount: 0,
        active_count: 0,
        auth_count: 0,
        ro_count_month: 0,
        monthly_revenue: 0,
        nps_avg: null,
        nps_count: 0,
        grade_distribution: {},
      },
    };
  }

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const empIds = rows.map((r) => r.id);

  // 本月 start (UTC); 全部 KPI 比較以 UTC 為準
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  // 90 天前
  const npsWindow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 90),
  ).toISOString();

  /* RO aggregations — 一次撈整批 */
  type RoMin = {
    sa_id: string | null;
    opened_at: string;
    closed_at: string | null;
    lines_total: number | null;
  };
  const { data: roRows } = await supabase
    .from("repair_orders")
    .select("sa_id, opened_at, closed_at, lines_total")
    .eq("brand_id", brand)
    .in("sa_id", empIds);

  const roByEmp = new Map<
    string,
    { total: number; month: number; revenue: number }
  >();
  for (const r of (roRows ?? []) as RoMin[]) {
    if (!r.sa_id) continue;
    const cur = roByEmp.get(r.sa_id) ?? { total: 0, month: 0, revenue: 0 };
    cur.total += 1;
    if (r.opened_at >= monthStart) {
      cur.month += 1;
      cur.revenue += Number(r.lines_total ?? 0);
    }
    roByEmp.set(r.sa_id, cur);
  }

  /* NPS aggregations — 過去 90 天 */
  type NpsMin = { score: number | null; metadata: { assigned_to_emp_id?: string } };
  const { data: npsRows } = await supabase
    .from("nps_responses")
    .select("score, metadata")
    .eq("brand_id", brand)
    .eq("kind", "aftersales")
    .gte("responded_at", npsWindow);

  const npsByEmp = new Map<
    string,
    { sum: number; count: number; promoter: number }
  >();
  let summaryNpsSum = 0;
  let summaryNpsCount = 0;
  for (const r of (npsRows ?? []) as NpsMin[]) {
    const score = Number(r.score ?? 0);
    if (Number.isNaN(score)) continue;
    summaryNpsSum += score;
    summaryNpsCount += 1;
    const emp = r.metadata?.assigned_to_emp_id;
    if (!emp || !empIds.includes(emp)) continue;
    const cur = npsByEmp.get(emp) ?? { sum: 0, count: 0, promoter: 0 };
    cur.sum += score;
    cur.count += 1;
    if (score >= 9) cur.promoter += 1;
    npsByEmp.set(emp, cur);
  }

  /* 組合 */
  const rowsWithKpi: AftersalesStaffRowWithKpi[] = rows.map((r) => {
    const ro = roByEmp.get(r.id) ?? { total: 0, month: 0, revenue: 0 };
    const nps = npsByEmp.get(r.id);
    return {
      ...r,
      kpi: {
        emp_id: r.id,
        ro_count_total: ro.total,
        ro_count_month: ro.month,
        monthly_revenue: ro.revenue,
        nps_avg: nps && nps.count > 0 ? nps.sum / nps.count : null,
        nps_count: nps?.count ?? 0,
        csat_pct:
          nps && nps.count > 0 ? Math.round((nps.promoter / nps.count) * 100) : null,
      },
    };
  });

  /* Summary */
  const gradeDist: Record<string, number> = {};
  let activeCount = 0;
  let authCount = 0;
  let summaryMonthRo = 0;
  let summaryMonthRevenue = 0;
  for (const r of rows) {
    if (r.is_active) activeCount += 1;
    if (r.final_inspection_auth) authCount += 1;
    if (r.grade) gradeDist[r.grade] = (gradeDist[r.grade] ?? 0) + 1;
    const ro = roByEmp.get(r.id);
    if (ro) {
      summaryMonthRo += ro.month;
      summaryMonthRevenue += ro.revenue;
    }
  }

  return {
    rows: rowsWithKpi,
    totalCount,
    summary: {
      headcount: rows.length,
      active_count: activeCount,
      auth_count: authCount,
      ro_count_month: summaryMonthRo,
      monthly_revenue: summaryMonthRevenue,
      nps_avg: summaryNpsCount > 0 ? summaryNpsSum / summaryNpsCount : null,
      nps_count: summaryNpsCount,
      grade_distribution: gradeDist,
    },
  };
}

/** 單一員工 KPI（detail view 用） */
export async function getAftersalesStaffKpi(
  empId: string,
): Promise<AftersalesStaffKpi> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  const npsWindow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 90),
  ).toISOString();

  type RoMin = {
    opened_at: string;
    lines_total: number | null;
  };
  const { data: roRows } = await supabase
    .from("repair_orders")
    .select("opened_at, lines_total")
    .eq("brand_id", brand)
    .eq("sa_id", empId);

  let total = 0;
  let month = 0;
  let revenue = 0;
  for (const r of (roRows ?? []) as RoMin[]) {
    total += 1;
    if (r.opened_at >= monthStart) {
      month += 1;
      revenue += Number(r.lines_total ?? 0);
    }
  }

  type NpsMin = { score: number | null };
  const { data: npsRows } = await supabase
    .from("nps_responses")
    .select("score")
    .eq("brand_id", brand)
    .eq("kind", "aftersales")
    .gte("responded_at", npsWindow)
    .eq("metadata->>assigned_to_emp_id", empId);

  let sum = 0;
  let count = 0;
  let promoter = 0;
  for (const r of (npsRows ?? []) as NpsMin[]) {
    const score = Number(r.score ?? 0);
    if (Number.isNaN(score)) continue;
    sum += score;
    count += 1;
    if (score >= 9) promoter += 1;
  }

  return {
    emp_id: empId,
    ro_count_total: total,
    ro_count_month: month,
    monthly_revenue: revenue,
    nps_avg: count > 0 ? sum / count : null,
    nps_count: count,
    csat_pct: count > 0 ? Math.round((promoter / count) * 100) : null,
  };
}

/** distinct grade options 給 filter dropdown */
export async function listAftersalesStaffGrades(): Promise<string[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("employees")
    .select("metadata")
    .eq("brand_id", brand)
    .eq("is_active", true);
  if (error) return [];
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ metadata: AftersalesStaffMetadata }>) {
    const g = r.metadata?.grade;
    if (typeof g === "string" && g) set.add(g);
  }
  return Array.from(set).sort();
}

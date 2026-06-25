"use server";

/**
 * Domain Helper — Sales Staff（RS 人員 / 業務部員工）
 *
 * 設計稿：docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html § Tab3
 * 路由：/sales/manager/staff
 * Proposal：docs/proposals/feature-rs-m3-staff-phase1.md
 *
 * 紀律：
 *  - 主表用 employees（與 aftersales-staff 共用）；不另建表
 *  - sales-only 屬性放 metadata.sales.{key}（aftersales root keys 不動）
 *  - 預設 filter 限定「業務部」（dept_code='SAL' / name 含「業務」「銷售」）
 *  - UI 永遠走本 helper，不直連 supabase
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  SALES_DEPT_CODES,
  SALES_DEPT_NAME_PATTERN,
  SALES_STAFF_PAGE_SIZE_DEFAULT,
  type SalesStaffMetadata,
  currentMonthRange,
  getResponsibleModels,
  writeResponsibleModels,
} from "./sales-staff.constants";

export type SalesStaffRow = {
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
  user_id: string | null;
  is_active: boolean;
  responsible_models: string[];
  /** 接觸數（本月 sales_leads count by rs_name） */
  contacts_this_month: number;
  /** 成交數（本月 sales_leads where converted_customer_id is not null） */
  deals_this_month: number;
  /** 顯示用：metadata.system_account 或 email 取一 */
  account_display: string | null;
  metadata: SalesStaffMetadata;
  created_at: string | null;
  updated_at: string | null;
};

export type SalesDepartmentOption = {
  id: string;
  name: string;
  code: string | null;
};

export type SalesStaffFilters = {
  q?: string;
  status?: "all" | "active" | "inactive";
  /** 篩特定車系（只回 responsible_models 含此 series、或 responsible_models 為空=全車系 的人） */
  series?: string;
};

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/* ────────────── helpers ────────────── */

function isSalesDept(d: { code: string | null; name: string }): boolean {
  if (d.code && (SALES_DEPT_CODES as readonly string[]).includes(d.code.toUpperCase())) {
    return true;
  }
  return SALES_DEPT_NAME_PATTERN.test(d.name);
}

function pickMetadata(meta: unknown): SalesStaffMetadata {
  if (!meta || typeof meta !== "object") return {};
  return meta as SalesStaffMetadata;
}

function rowFromDb(
  row: Record<string, unknown>,
  deptMap: Map<string, SalesDepartmentOption>,
  monthlyByName: Map<string, { contacts: number; deals: number }>,
): SalesStaffRow {
  const meta = pickMetadata(row.metadata);
  const dept = row.dept_id ? deptMap.get(row.dept_id as string) ?? null : null;
  const name = row.name as string;
  const monthly = monthlyByName.get(name) ?? { contacts: 0, deals: 0 };
  const responsible_models = getResponsibleModels(meta);
  const email = (row.email as string | null) ?? null;
  const systemAccount = (meta.system_account as string | null) ?? null;
  return {
    id: row.id as string,
    brand_id: row.brand_id as string,
    emp_code: row.emp_code as string,
    name,
    email,
    phone: (row.phone as string | null) ?? null,
    dept_id: (row.dept_id as string | null) ?? null,
    dept_name: dept?.name ?? null,
    dept_code: dept?.code ?? null,
    position: (row.position as string | null) ?? null,
    user_id: (row.user_id as string | null) ?? null,
    is_active: Boolean(row.is_active ?? true),
    responsible_models,
    contacts_this_month: monthly.contacts,
    deals_this_month: monthly.deals,
    account_display: email ?? systemAccount,
    metadata: meta,
    created_at: (row.created_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

/* ────────────── Read ────────────── */

/** 列出當前 brand 的業務部門（給 dept_id 解析用） */
export async function listSalesDepartments(): Promise<SalesDepartmentOption[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("departments")
    .select("id, name, code")
    .eq("brand_id", brand)
    .order("name");
  if (error) return [];
  return ((data ?? []) as Array<{ id: string; name: string; code: string | null }>)
    .filter(isSalesDept)
    .map((d) => ({ id: d.id, name: d.name, code: d.code }));
}

/**
 * 列出當前 brand 可用車系（distinct vehicle_models.series where is_active）
 * 給 filter / Modal multi-select 用。
 */
export async function listAvailableSeries(): Promise<string[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("vehicle_models")
    .select("series")
    .eq("brand_id", brand)
    .eq("is_active", true);
  if (error) return [];
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ series: string | null }>) {
    if (r.series) set.add(r.series);
  }
  return Array.from(set).sort();
}

/** 撈本月 sales_leads → 依 rs_name 聚合接觸數 / 成交數 */
async function fetchMonthlyMetricsByRsName(brand: string): Promise<
  Map<string, { contacts: number; deals: number }>
> {
  const supabase = await createClient();
  const { from, to } = currentMonthRange();
  // 一次撈本月該 brand 全部 leads，再 in-memory aggregate（量小、簡單）
  const { data, error } = await supabase
    .from("sales_dormant_leads")
    .select("rs_name, converted_customer_id, created_at")
    .eq("brand_id", brand)
    .gte("created_at", from)
    .lt("created_at", to);
  if (error) return new Map();

  const map = new Map<string, { contacts: number; deals: number }>();
  for (const r of (data ?? []) as Array<{
    rs_name: string | null;
    converted_customer_id: string | null;
  }>) {
    const key = (r.rs_name ?? "").trim();
    if (!key) continue;
    const slot = map.get(key) ?? { contacts: 0, deals: 0 };
    slot.contacts += 1;
    if (r.converted_customer_id) slot.deals += 1;
    map.set(key, slot);
  }
  return map;
}

/**
 * 列出 RS 人員。預設只回業務部員工。
 */
export async function listSalesStaff(
  filters: SalesStaffFilters = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: SalesStaffRow[]; totalCount: number }> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? SALES_STAFF_PAGE_SIZE_DEFAULT);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const salesDepts = await listSalesDepartments();
  const salesDeptIds = new Set(salesDepts.map((d) => d.id));
  const deptMap = new Map(salesDepts.map((d) => [d.id, d]));

  if (salesDeptIds.size === 0) {
    return { rows: [], totalCount: 0 };
  }

  let q = supabase
    .from("employees")
    .select(
      "id, brand_id, emp_code, name, email, phone, dept_id, position, user_id, is_active, metadata, created_at, updated_at",
      { count: "exact" },
    )
    .eq("brand_id", brand)
    .in("dept_id", Array.from(salesDeptIds));

  if (filters.status === "active") q = q.eq("is_active", true);
  if (filters.status === "inactive") q = q.eq("is_active", false);

  if (filters.q?.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(`name.ilike.%${t}%,emp_code.ilike.%${t}%,email.ilike.%${t}%,position.ilike.%${t}%`);
  }

  const { data, count, error } = await q
    .order("emp_code", { ascending: true })
    .range(from, to);
  if (error) throw new Error(`listSalesStaff: ${error.message}`);

  const monthly = await fetchMonthlyMetricsByRsName(brand);
  let rows = (data ?? []).map((r) =>
    rowFromDb(r as Record<string, unknown>, deptMap, monthly),
  );

  // series filter 走 in-memory（responsible_models 在 jsonb 內、PostgREST 處理麻煩）
  if (filters.series && filters.series !== "all") {
    rows = rows.filter((r) => {
      // 「全車系」也算包含
      if (r.responsible_models.length === 0) return true;
      return r.responsible_models.includes(filters.series!);
    });
  }

  return { rows, totalCount: count ?? rows.length };
}

/* ────────────── Write ────────────── */

/**
 * 更新某 RS 的負責車系（multi-select）。
 * - models=[] 表示「全車系」（清空 responsible_models）
 * - 寫入前驗證每個 series 都在當前 brand 的 vehicle_models.series 集合內
 */
export async function updateResponsibleModelsAction(
  employeeId: string,
  models: string[],
): Promise<ActionResult<{ id: string }>> {
  if (!employeeId) return { ok: false, error: "缺少 employee id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 驗證 series 在當前 brand
  const available = await listAvailableSeries();
  const availableSet = new Set(available);
  const cleaned: string[] = [];
  for (const m of models) {
    const s = (m ?? "").trim();
    if (!s) continue;
    if (!availableSet.has(s)) {
      return { ok: false, error: `「${s}」不是當前品牌的車系` };
    }
    if (!cleaned.includes(s)) cleaned.push(s);
  }

  // 讀現有 metadata、merge
  const { data: cur, error: readErr } = await supabase
    .from("employees")
    .select("id, metadata")
    .eq("id", employeeId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (readErr || !cur) {
    return { ok: false, error: readErr?.message ?? "找不到該員工" };
  }

  const nextMetadata = writeResponsibleModels(
    pickMetadata(cur.metadata),
    cleaned,
  );

  const { error: upErr } = await supabase
    .from("employees")
    .update({ metadata: nextMetadata })
    .eq("id", employeeId)
    .eq("brand_id", brand);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true, data: { id: employeeId } };
}

/** 啟用 / 停用 RS */
export async function setSalesStaffActiveAction(
  employeeId: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  if (!employeeId) return { ok: false, error: "缺少 employee id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("employees")
    .update({ is_active: active })
    .eq("id", employeeId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: employeeId } };
}

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
      "id, brand_id, emp_code, name, email, phone, dept_id, position, hire_date, leave_date, employment_status, is_active, notes, metadata, created_at, updated_at",
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
      "id, brand_id, emp_code, name, email, phone, dept_id, position, hire_date, leave_date, employment_status, is_active, notes, metadata, created_at, updated_at",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error || !data) return null;

  const aftersalesDepts = await listAftersalesDepartments();
  const deptMap = new Map(aftersalesDepts.map((d) => [d.id, d]));
  return rowFromDb(data as Record<string, unknown>, deptMap);
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

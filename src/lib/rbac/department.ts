import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

/**
 * P-08 部門資料隔離 — 部門 / 角色判斷層。
 *
 * 設計重點：
 *   - employees.user_id 大量未綁，本 helper 透過 auth.email 對 employees.email 找出對應 employee
 *   - 部門 code 對映 NetSuite-style 縮寫：SAL（業務）/ SVC（維修）/ PRT（零配件）/ QA（品保）
 *   - 「部門主管」走既有 role_codes 慣例（rs_manager / aftersales_lead / workshop_manager / parts_manager / sales_manager / service_manager / store_manager）
 *   - 跨部門 admin 走既有 app_admins 機制（getCurrentUserAndAdmin().isAdmin）
 *   - private 表的 RLS 只擋 brand_id，部門邏輯一律走這支 helper（未來員工帳號齊備可升級回 RLS）
 */

export type DeptCode = "SAL" | "SVC" | "PRT" | "QA";

const MANAGER_ROLE_CODES = [
  "rs_manager",
  "aftersales_lead",
  "workshop_manager",
  "parts_manager",
  "sales_manager",
  "service_manager",
  "store_manager",
] as const;

export type UserDepartment = {
  employee: { id: string; brand_id: string; dept_id: string | null } | null;
  dept_code: DeptCode | null;
  role_codes: readonly string[];
  is_dept_manager: boolean;
  is_cross_admin: boolean;
};

const EMPTY: UserDepartment = {
  employee: null,
  dept_code: null,
  role_codes: [],
  is_dept_manager: false,
  is_cross_admin: false,
};

export const getCurrentUserDepartment = cache(
  async (): Promise<UserDepartment> => {
    const base = await getCurrentUserAndAdmin();
    if (!base.email) return EMPTY;

    const supabase = await createClient();
    const { data: emp } = await supabase
      .from("employees")
      .select("id, brand_id, dept_id, role_codes, departments:dept_id(code)")
      .ilike("email", base.email)
      .eq("is_active", true)
      .maybeSingle();

    if (!emp) {
      return { ...EMPTY, is_cross_admin: base.isAdmin };
    }

    const deptCode = (emp.departments as { code?: string } | null)?.code ?? null;
    const roleCodes: string[] = Array.isArray(emp.role_codes) ? emp.role_codes : [];
    const isDeptManager = roleCodes.some((r) =>
      (MANAGER_ROLE_CODES as readonly string[]).includes(r),
    );

    return {
      employee: { id: emp.id, brand_id: emp.brand_id, dept_id: emp.dept_id },
      dept_code: isDeptCode(deptCode) ? deptCode : null,
      role_codes: roleCodes,
      is_dept_manager: isDeptManager,
      is_cross_admin: base.isAdmin,
    };
  },
);

function isDeptCode(code: string | null): code is DeptCode {
  return code === "SAL" || code === "SVC" || code === "PRT" || code === "QA";
}

/** RS 部門（含主管）或 cross-admin 可看 sales_private */
export function canViewSalesPrivate(d: UserDepartment): boolean {
  if (d.is_cross_admin) return true;
  return d.dept_code === "SAL";
}

/** SA 部門（含主管）或 cross-admin 可看 service_private */
export function canViewServicePrivate(d: UserDepartment): boolean {
  if (d.is_cross_admin) return true;
  return d.dept_code === "SVC";
}

/** RS 部門寫入 sales_private 的權限（同 view 條件） */
export function canEditSalesPrivate(d: UserDepartment): boolean {
  return canViewSalesPrivate(d);
}

export function canEditServicePrivate(d: UserDepartment): boolean {
  return canViewServicePrivate(d);
}

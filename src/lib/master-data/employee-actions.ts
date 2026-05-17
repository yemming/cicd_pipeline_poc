"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { EmployeeFieldKey } from "./employee-form-types";

import { getActiveScope } from "@/lib/scope/active-scope";

const EMPLOYMENT_STATUSES = ["active", "on_leave", "terminated", "retired"] as const;
type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Partial<Record<EmployeeFieldKey, string>> };

export type EmployeeInput = {
  emp_code: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  dept_id?: string | null;
  position?: string | null;
  hire_date?: string | null;
  leave_date?: string | null;
  pay_rate?: number | null;
  employment_status?: EmploymentStatus | null;
  notes?: string | null;
  is_active?: boolean;
};

function trim(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function pickStatus(raw: string | null | undefined): EmploymentStatus {
  const v = String(raw ?? "active");
  return (EMPLOYMENT_STATUSES as readonly string[]).includes(v)
    ? (v as EmploymentStatus)
    : "active";
}

/**
 * 23505 = unique_violation；只判斷 constraint 名，避開硬編 message 文字。
 */
function mapDbError(error: { code?: string; message: string }): {
  error: string;
  fieldErrors?: Partial<Record<EmployeeFieldKey, string>>;
} {
  if (error.code === "23505" && error.message.includes("employees_brand_emp_code_unique")) {
    return {
      error: "員工代碼重複",
      fieldErrors: { emp_code: "此員工代碼已存在，請改一個" },
    };
  }
  return { error: `儲存失敗：${error.message}` };
}

function buildPayload(input: EmployeeInput) {
  return {
    emp_code: (input.emp_code ?? "").trim(),
    name: (input.name ?? "").trim(),
    email: trim(input.email ?? null),
    phone: trim(input.phone ?? null),
    dept_id: trim(input.dept_id ?? null),
    position: trim(input.position ?? null),
    hire_date: trim(input.hire_date ?? null),
    leave_date: trim(input.leave_date ?? null),
    pay_rate: input.pay_rate ?? null,
    employment_status: pickStatus(input.employment_status),
    notes: trim(input.notes ?? null),
  };
}

export async function createEmployeeAction(
  input: EmployeeInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.EMPLOYEE_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };

  const payload = buildPayload(input);
  const fieldErrors: Partial<Record<EmployeeFieldKey, string>> = {};
  if (!payload.emp_code) fieldErrors.emp_code = "必填";
  if (!payload.name) fieldErrors.name = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("employees")
    .insert({
      brand_id: scope.brand_id,
      subsidiary_id: scope.subsidiary_id,
      ...payload,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  revalidatePath("/admin/master-data/employees");
  return { ok: true, data: { id: data.id } };
}

export async function updateEmployeeAction(
  id: string,
  input: EmployeeInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.EMPLOYEE_EDIT);
  if (!id) return { ok: false, error: "缺少 employee id" };

  const payload = buildPayload(input);
  const fieldErrors: Partial<Record<EmployeeFieldKey, string>> = {};
  if (!payload.emp_code) fieldErrors.emp_code = "必填";
  if (!payload.name) fieldErrors.name = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({
      ...payload,
      ...(input.is_active === undefined ? {} : { is_active: input.is_active }),
    })
    .eq("id", id);
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  revalidatePath("/admin/master-data/employees");
  revalidatePath(`/admin/master-data/employees/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteEmployeeAction(
  id: string,
): Promise<ActionResult<null>> {
  await requirePermission(PERMISSIONS.EMPLOYEE_EDIT);
  if (!id) return { ok: false, error: "缺少 employee id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .delete()
    .eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "此員工被工單／預約／部門引用，無法刪除。建議改用「離職」狀態保留歷史。",
      };
    }
    return { ok: false, error: `刪除失敗：${error.message}` };
  }
  revalidatePath("/admin/master-data/employees");
  return { ok: true, data: null };
}

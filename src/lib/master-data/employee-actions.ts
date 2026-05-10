"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { EmployeeFormState } from "./employee-form-types";

import { getActiveScope } from "@/lib/scope/active-scope";
const EMPLOYMENT_STATUSES = ["active", "on_leave", "terminated", "retired"] as const;
type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

function pickStatus(raw: FormDataEntryValue | null): EmploymentStatus {
  const v = String(raw ?? "active");
  return (EMPLOYMENT_STATUSES as readonly string[]).includes(v)
    ? (v as EmploymentStatus)
    : "active";
}

function strOrNull(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  return v.length === 0 ? null : v;
}

function dateOrNull(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  return v.length === 0 ? null : v;
}

function numOrNull(raw: FormDataEntryValue | null): number | null {
  const v = String(raw ?? "").trim();
  if (v.length === 0) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 把 supabase / postgres 錯誤翻成 EmployeeFormState。
 *
 * 23505 = unique_violation；只判斷 constraint 名，避開硬編 message 文字。
 */
function mapDbError(error: { code?: string; message: string }): EmployeeFormState {
  if (error.code === "23505" && error.message.includes("employees_brand_emp_code_unique")) {
    return {
      error: "員工代碼重複",
      fieldErrors: { emp_code: "此員工代碼已存在，請改一個" },
    };
  }
  return { error: `儲存失敗：${error.message}` };
}

export async function createEmployeeAction(
  _prevState: EmployeeFormState,
  fd: FormData,
): Promise<EmployeeFormState> {
  await requirePermission(PERMISSIONS.EMPLOYEE_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) redirect("/login");

  const empCode = String(fd.get("emp_code") ?? "").trim();
  const name = String(fd.get("name") ?? "").trim();
  const fieldErrors: EmployeeFormState["fieldErrors"] = {};
  if (!empCode) fieldErrors.emp_code = "必填";
  if (!name) fieldErrors.name = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("employees").insert({
    brand_id: (await getActiveScope()).brand_id,
    emp_code: empCode,
    name,
    email: strOrNull(fd.get("email")),
    phone: strOrNull(fd.get("phone")),
    dept_id: strOrNull(fd.get("dept_id")),
    position: strOrNull(fd.get("position")),
    hire_date: dateOrNull(fd.get("hire_date")),
    leave_date: dateOrNull(fd.get("leave_date")),
    pay_rate: numOrNull(fd.get("pay_rate")),
    employment_status: pickStatus(fd.get("employment_status")),
    notes: strOrNull(fd.get("notes")),
    created_by: ctx.userId,
  });
  if (error) return mapDbError(error);

  revalidatePath("/admin/master-data/employees");
  redirect("/admin/master-data/employees");
}

export async function updateEmployeeAction(
  _prevState: EmployeeFormState,
  fd: FormData,
): Promise<EmployeeFormState> {
  await requirePermission(PERMISSIONS.EMPLOYEE_EDIT);

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "缺少 employee id" };

  const empCode = String(fd.get("emp_code") ?? "").trim();
  const name = String(fd.get("name") ?? "").trim();
  const fieldErrors: EmployeeFormState["fieldErrors"] = {};
  if (!empCode) fieldErrors.emp_code = "必填";
  if (!name) fieldErrors.name = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({
      emp_code: empCode,
      name,
      email: strOrNull(fd.get("email")),
      phone: strOrNull(fd.get("phone")),
      dept_id: strOrNull(fd.get("dept_id")),
      position: strOrNull(fd.get("position")),
      hire_date: dateOrNull(fd.get("hire_date")),
      leave_date: dateOrNull(fd.get("leave_date")),
      pay_rate: numOrNull(fd.get("pay_rate")),
      employment_status: pickStatus(fd.get("employment_status")),
      is_active: fd.get("is_active") === "on",
      notes: strOrNull(fd.get("notes")),
    })
    .eq("id", id);
  if (error) return mapDbError(error);

  revalidatePath("/admin/master-data/employees");
  revalidatePath(`/admin/master-data/employees/${id}`);
  redirect("/admin/master-data/employees");
}

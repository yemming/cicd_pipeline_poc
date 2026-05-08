"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

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

export async function createEmployeeAction(fd: FormData): Promise<void> {
  await requirePermission(PERMISSIONS.EMPLOYEE_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) redirect("/login");

  const brandId = getBrandKey();

  const empCode = String(fd.get("emp_code") ?? "").trim();
  const name = String(fd.get("name") ?? "").trim();
  if (!empCode || !name) throw new Error("員工代碼與姓名為必填");

  const supabase = await createClient();
  const { error } = await supabase.from("employees").insert({
    brand_id: brandId,
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
  if (error) throw new Error(`createEmployee: ${error.message}`);

  revalidatePath("/admin/master-data/employees");
  redirect("/admin/master-data/employees");
}

export async function updateEmployeeAction(fd: FormData): Promise<void> {
  await requirePermission(PERMISSIONS.EMPLOYEE_EDIT);

  const id = String(fd.get("id") ?? "").trim();
  if (!id) throw new Error("缺少 employee id");

  const empCode = String(fd.get("emp_code") ?? "").trim();
  const name = String(fd.get("name") ?? "").trim();
  if (!empCode || !name) throw new Error("員工代碼與姓名為必填");

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
  if (error) throw new Error(`updateEmployee: ${error.message}`);

  revalidatePath("/admin/master-data/employees");
  revalidatePath(`/admin/master-data/employees/${id}`);
  redirect("/admin/master-data/employees");
}

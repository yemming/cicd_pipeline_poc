"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  createEmployeeRoleType,
  updateEmployeeRoleType,
  deactivateEmployeeRoleType,
  listEmployeesUsingRole,
} from "@/domain/employee-roles";
import type {
  EmployeeRoleInput,
  EmployeeRoleUpdateInput,
  EmployeeUsingRole,
  RoleActionResult,
} from "@/domain/employee-roles.constants";

const BASE_PATH = "/admin/master-data/employee-roles";

export async function createEmployeeRoleAction(
  input: EmployeeRoleInput,
): Promise<RoleActionResult<{ code: string }>> {
  await requirePermission(PERMISSIONS.EMPLOYEE_EDIT);
  const res = await createEmployeeRoleType(input);
  if (res.ok) revalidatePath(BASE_PATH);
  return res;
}

export async function updateEmployeeRoleAction(
  code: string,
  patch: EmployeeRoleUpdateInput,
): Promise<RoleActionResult<{ code: string }>> {
  await requirePermission(PERMISSIONS.EMPLOYEE_EDIT);
  const res = await updateEmployeeRoleType(code, patch);
  if (res.ok) {
    revalidatePath(BASE_PATH);
    revalidatePath(`${BASE_PATH}/${code}`);
  }
  return res;
}

export async function deactivateEmployeeRoleAction(
  code: string,
): Promise<RoleActionResult<{ code: string }>> {
  await requirePermission(PERMISSIONS.EMPLOYEE_EDIT);
  const res = await deactivateEmployeeRoleType(code);
  if (res.ok) revalidatePath(BASE_PATH);
  return res;
}

/** detail page 反查「哪些員工掛此角色」（唯讀，view mode 進場後 lazy load） */
export async function listEmployeesUsingRoleAction(
  code: string,
): Promise<RoleActionResult<EmployeeUsingRole[]>> {
  await requirePermission(PERMISSIONS.EMPLOYEE_VIEW);
  try {
    const data = await listEmployeesUsingRole(code);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "讀取使用此角色的員工失敗" };
  }
}

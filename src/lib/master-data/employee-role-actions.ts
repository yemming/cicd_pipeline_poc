"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  createEmployeeRoleType,
  updateEmployeeRoleType,
  deactivateEmployeeRoleType,
} from "@/domain/employee-roles";
import type {
  EmployeeRoleInput,
  EmployeeRoleUpdateInput,
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

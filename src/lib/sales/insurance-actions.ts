"use server";

/**
 * Server Actions — Sales Insurance（保險招攬）
 *
 * Result 型別、不 redirect、client 自決導航。
 * 權限：SALES_INSURANCE_VIEW / SALES_INSURANCE_EDIT。
 */

import { revalidatePath } from "next/cache";

import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  createPolicy,
  updatePolicy,
  markRenewed,
  markCancelled,
  deletePolicy,
  type CreatePolicyInput,
  type UpdatePolicyInput,
} from "@/domain/sales-insurance";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const LIST_PATH = "/sales/insurance";

export async function createPolicyAction(
  input: CreatePolicyInput,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_INSURANCE_EDIT);
  if (!canEdit) return { ok: false, error: "沒有建立保險件的權限" };

  const res = await createPolicy(input);
  if (res.ok) revalidatePath(LIST_PATH);
  return res;
}

export async function updatePolicyAction(
  id: string,
  patch: UpdatePolicyInput,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_INSURANCE_EDIT);
  if (!canEdit) return { ok: false, error: "沒有修改保單的權限" };

  const res = await updatePolicy(id, patch);
  if (res.ok) revalidatePath(LIST_PATH);
  return res;
}

export async function markRenewedAction(id: string): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_INSURANCE_EDIT);
  if (!canEdit) return { ok: false, error: "沒有標記續保的權限" };

  const res = await markRenewed(id);
  if (res.ok) revalidatePath(LIST_PATH);
  return res;
}

export async function markCancelledAction(id: string): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_INSURANCE_EDIT);
  if (!canEdit) return { ok: false, error: "沒有取消保單的權限" };

  const res = await markCancelled(id);
  if (res.ok) revalidatePath(LIST_PATH);
  return res;
}

export async function deletePolicyAction(id: string): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_INSURANCE_EDIT);
  if (!canEdit) return { ok: false, error: "沒有刪除保單的權限" };

  const res = await deletePolicy(id);
  if (res.ok) revalidatePath(LIST_PATH);
  return res;
}

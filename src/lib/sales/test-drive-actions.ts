"use server";

/**
 * Server Actions — Sales Test Drives（GAP-03、P1-#12）
 *
 * Result 型別、不 redirect、client 自決導航。
 * 權限借用 SALES_ORDER_VIEW / SALES_ORDER_EDIT（試駕屬銷售模組、跟訂單同分組）。
 */

import { revalidatePath } from "next/cache";

import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  createTestDrive,
  updateTestDrive,
  deleteTestDrive,
  type CreateTestDriveInput,
  type UpdateTestDriveInput,
} from "@/domain/sales-test-drives";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const LIST_PATH = "/sales/test-drives";

// ─────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────

export async function createTestDriveAction(
  input: CreateTestDriveInput,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有建立試駕記錄的權限" };

  const res = await createTestDrive(input);
  if (res.ok) revalidatePath(LIST_PATH);
  return res;
}

// ─────────────────────────────────────────────────────────────
// Update
// ─────────────────────────────────────────────────────────────

export async function updateTestDriveAction(
  id: string,
  patch: UpdateTestDriveInput,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有修改試駕記錄的權限" };

  const res = await updateTestDrive(id, patch);
  if (res.ok) revalidatePath(LIST_PATH);
  return res;
}

// ─────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────

export async function deleteTestDriveAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有刪除試駕記錄的權限" };

  const res = await deleteTestDrive(id);
  if (res.ok) revalidatePath(LIST_PATH);
  return res;
}

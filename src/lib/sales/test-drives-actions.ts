"use server";

/**
 * Server actions for /sales/reception/test-rides — P1-1（A 級升級）
 *
 * client 不直接 import @/lib/supabase；統一透過 @/domain/sales-test-drives。
 */

import { revalidatePath } from "next/cache";

import {
  createTestDrive,
  updateTestDrive,
  deleteTestDrive,
  completeTestDrive,
  linkToHandcard,
} from "@/domain/sales-test-drives";
import type {
  CreateTestDriveInput,
  UpdateTestDriveInput,
  CompleteTestDriveInput,
  Result,
} from "@/domain/sales-test-drives.constants";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const LIST_PATH = "/sales/reception/test-rides";

async function gate(): Promise<Result<true>> {
  // 銷售試駕沒專屬 permission；現階段沿用 CUSTOMER_EDIT（接待手卡權限）
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_EDIT))) {
    return { ok: false, error: "沒有編輯試駕記錄的權限" };
  }
  return { ok: true, data: true };
}

export async function createTestDriveAction(
  input: CreateTestDriveInput,
): Promise<Result<{ id: string }>> {
  const g = await gate();
  if (!g.ok) return g;
  const res = await createTestDrive(input);
  if (res.ok) revalidatePath(LIST_PATH);
  return res;
}

export async function updateTestDriveAction(
  id: string,
  patch: UpdateTestDriveInput,
): Promise<Result<{ id: string }>> {
  const g = await gate();
  if (!g.ok) return g;
  const res = await updateTestDrive(id, patch);
  if (res.ok) {
    revalidatePath(LIST_PATH);
    revalidatePath(`${LIST_PATH}/${id}`);
  }
  return res;
}

export async function deleteTestDriveAction(
  id: string,
): Promise<Result<{ id: string }>> {
  const g = await gate();
  if (!g.ok) return g;
  const res = await deleteTestDrive(id);
  if (res.ok) revalidatePath(LIST_PATH);
  return res;
}

export async function completeTestDriveAction(
  id: string,
  payload: CompleteTestDriveInput,
): Promise<Result<{ id: string; handcard_id: string | null }>> {
  const g = await gate();
  if (!g.ok) return g;
  const res = await completeTestDrive(id, payload);
  if (res.ok) {
    revalidatePath(LIST_PATH);
    revalidatePath(`${LIST_PATH}/${id}`);
  }
  return res;
}

export async function linkToHandcardAction(
  testRideId: string,
  handcardId: string,
): Promise<Result<{ id: string }>> {
  const g = await gate();
  if (!g.ok) return g;
  const res = await linkToHandcard(testRideId, handcardId);
  if (res.ok) {
    revalidatePath(LIST_PATH);
    revalidatePath(`${LIST_PATH}/${testRideId}`);
  }
  return res;
}

export async function setTestDriveStatusAction(
  id: string,
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show",
): Promise<Result<{ id: string }>> {
  const g = await gate();
  if (!g.ok) return g;
  // 切到 in_progress 時記 started_at 到 metadata
  const patch: UpdateTestDriveInput = { status };
  if (status === "in_progress") {
    patch.metadata = { started_at: new Date().toISOString() };
  }
  const res = await updateTestDrive(id, patch);
  if (res.ok) {
    revalidatePath(LIST_PATH);
    revalidatePath(`${LIST_PATH}/${id}`);
  }
  return res;
}

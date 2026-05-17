"use server";

/**
 * Server Actions — Sales Orders（成交訂單合約書）
 *
 * 所有 action 回傳 ActionResult<T>（client 自控導航，不 redirect）。
 * 權限守衛：hasPermission(PERMISSIONS.SALES_ORDER_EDIT)。
 */

import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  createSalesOrder,
  updateSalesOrder,
  setSalesOrderStatus,
  deleteSalesOrder,
  type CreateSalesOrderInput,
  type UpdateSalesOrderInput,
} from "@/domain/sales-orders";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────

export async function createSalesOrderAction(
  input: CreateSalesOrderInput,
): Promise<ActionResult<{ id: string; order_no: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有建立訂單的權限" };

  return createSalesOrder(input);
}

// ─────────────────────────────────────────────────────────────
// Update
// ─────────────────────────────────────────────────────────────

export async function updateSalesOrderAction(
  id: string,
  patch: UpdateSalesOrderInput,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有修改訂單的權限" };

  return updateSalesOrder(id, patch);
}

// ─────────────────────────────────────────────────────────────
// Set status
// ─────────────────────────────────────────────────────────────

export async function setSalesOrderStatusAction(
  id: string,
  status: "signed" | "cancelled" | "fulfilled",
): Promise<ActionResult<{ id: string }>> {
  if (status === "cancelled") {
    const canCancel = await hasPermission(PERMISSIONS.SALES_ORDER_CANCEL);
    if (!canCancel) return { ok: false, error: "沒有作廢訂單的權限" };
  } else {
    const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
    if (!canEdit) return { ok: false, error: "沒有更新訂單狀態的權限" };
  }

  return setSalesOrderStatus(id, status);
}

// ─────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────

export async function deleteSalesOrderAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有刪除訂單的權限" };

  return deleteSalesOrder(id);
}

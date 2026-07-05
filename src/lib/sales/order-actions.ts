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
  submitSalesOrderForApproval,
  approveSalesOrder,
  rejectSalesOrder,
  cancelSalesOrderStructured,
  deferDelivery,
  raiseUsedCarPostDeliveryDispute,
  requestNewCarReplacement,
  saveSignatures,
  lockContract,
  unlockContract,
  updateFinancingStatus,
  reassignSalesOrder,
  linkTradeInToSalesOrder,
  type CreateSalesOrderInput,
  type UpdateSalesOrderInput,
  type CancelOrderInput,
  type DeferDeliveryInput,
  type UsedCarPostDeliveryDisputeInput,
  type ReplaceNewCarInput,
  type SaveSignaturesInput,
  type UpdateFinancingInput,
  type ReassignOrderInput,
} from "@/domain/sales-orders";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────

export async function createSalesOrderAction(
  input: CreateSalesOrderInput,
): Promise<ActionResult<{ id: string; order_no: string; needs_approval: boolean }>> {
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
  status: "submitted" | "signed" | "cancelled" | "fulfilled",
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

// ─────────────────────────────────────────────────────────────
// Submit for approval（送簽） — P1-#6（第七輪 BDN）
// ─────────────────────────────────────────────────────────────

export async function submitForApprovalAction(
  orderId: string,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有送簽訂單的權限" };

  return submitSalesOrderForApproval(orderId);
}

// ─────────────────────────────────────────────────────────────
// Approve / Reject（簽核中心用） — P1-#6（第七輪 BDN）/ P0-#5（第八輪）
//
// 權限：SALES_ORDER_APPROVE（取消權 ≠ 簽核權；admin 自動有所有 permission）
// ─────────────────────────────────────────────────────────────

export async function approveSalesOrderAction(
  orderId: string,
  note?: string | null,
): Promise<ActionResult<{ id: string }>> {
  const canApprove = await hasPermission(PERMISSIONS.SALES_ORDER_APPROVE);
  if (!canApprove) return { ok: false, error: "沒有簽核訂單的權限" };

  return approveSalesOrder(orderId, note ?? null);
}

export async function rejectSalesOrderAction(
  orderId: string,
  note?: string | null,
): Promise<ActionResult<{ id: string }>> {
  const canApprove = await hasPermission(PERMISSIONS.SALES_ORDER_APPROVE);
  if (!canApprove) return { ok: false, error: "沒有簽核訂單的權限" };
  if (!note?.trim()) return { ok: false, error: "請填寫駁回原因" };

  return rejectSalesOrder(orderId, note.trim());
}

// ─────────────────────────────────────────────────────────────
// RS04 Stage 1 — 結構化取消（輪10）
// ─────────────────────────────────────────────────────────────

/**
 * cancelOrderStructuredAction — 結構化取消（含審閱期判斷、沒收裁量）
 *
 * 期後沒收（forfeit_rate > 0）需要 SALES_ORDER_FORFEIT 權限（主管限定）。
 */
export async function cancelOrderStructuredAction(
  orderId: string,
  input: CancelOrderInput,
): Promise<ActionResult<{ id: string; within_review_period: boolean }>> {
  const canCancel = await hasPermission(PERMISSIONS.SALES_ORDER_CANCEL);
  if (!canCancel) return { ok: false, error: "沒有取消訂單的權限" };

  // 期後沒收裁量需要 FORFEIT 權限（主管限定）
  if ((input.forfeit_rate ?? 0) > 0) {
    const canForfeit = await hasPermission(PERMISSIONS.SALES_ORDER_FORFEIT);
    if (!canForfeit) return { ok: false, error: "沒收裁量需要主管權限" };
  }

  return cancelSalesOrderStructured(orderId, input);
}

// ─────────────────────────────────────────────────────────────
// RS04③ 延期/無法交車
// ─────────────────────────────────────────────────────────────

export async function deferDeliveryAction(
  orderId: string,
  input: DeferDeliveryInput,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有修改訂單的權限" };
  if (!input.reason?.trim()) return { ok: false, error: "請填寫延期/無法交車原因" };

  return deferDelivery(orderId, input);
}

// ─────────────────────────────────────────────────────────────
// RS04⑥ 中古車交車後爭議
// ─────────────────────────────────────────────────────────────

export async function raiseUsedCarDisputeAction(
  orderId: string,
  input: UsedCarPostDeliveryDisputeInput,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有操作訂單的權限" };
  if (!input.reason?.trim()) return { ok: false, error: "請填寫爭議原因" };

  return raiseUsedCarPostDeliveryDispute(orderId, input);
}

// ─────────────────────────────────────────────────────────────
// RS04⑦ 新車換車申請
// ─────────────────────────────────────────────────────────────

export async function requestCarReplacementAction(
  orderId: string,
  input: ReplaceNewCarInput,
): Promise<ActionResult<{ id: string }>> {
  const canReplace = await hasPermission(PERMISSIONS.SALES_ORDER_REPLACE);
  if (!canReplace) return { ok: false, error: "沒有申請換車的權限" };
  if (!input.reason?.trim()) return { ok: false, error: "請填寫換車申請原因" };

  return requestNewCarReplacement(orderId, input);
}

// ─────────────────────────────────────────────────────────────
// RS04④ 三方簽名（輪5-7）
// ─────────────────────────────────────────────────────────────

export async function saveSignaturesAction(
  orderId: string,
  input: SaveSignaturesInput,
): Promise<ActionResult<{ id: string; contract_locked: boolean }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有修改訂單的權限" };

  return saveSignatures(orderId, input);
}

// ─────────────────────────────────────────────────────────────
// RS04⑤ 鎖定（輪5-8） — lockContractAction 任何可 edit 的人都能鎖
// ─────────────────────────────────────────────────────────────

export async function lockContractAction(
  orderId: string,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有鎖定合約的權限" };

  return lockContract(orderId);
}

// ─────────────────────────────────────────────────────────────
// RS04⑤ 解鎖（輪5-8）— unlockContractAction 需主管（FORFEIT 或 APPROVE）
// ─────────────────────────────────────────────────────────────

export async function unlockContractAction(
  orderId: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  // 解鎖需要主管權限：FORFEIT（有沒收裁量的主管）或 APPROVE（簽核主管）
  const [canForfeit, canApprove] = await Promise.all([
    hasPermission(PERMISSIONS.SALES_ORDER_FORFEIT),
    hasPermission(PERMISSIONS.SALES_ORDER_APPROVE),
  ]);
  if (!canForfeit && !canApprove) {
    return { ok: false, error: "解鎖合約需要主管權限" };
  }
  if (!reason.trim()) return { ok: false, error: "請填寫解鎖原因" };

  return unlockContract(orderId, reason);
}

// ─────────────────────────────────────────────────────────────
// A-6 融資狀態更新
// ─────────────────────────────────────────────────────────────

export async function updateFinancingStatusAction(
  orderId: string,
  input: UpdateFinancingInput,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有修改訂單的權限" };

  return updateFinancingStatus(orderId, input);
}

// ─────────────────────────────────────────────────────────────
// A-9 業務員轉移（主管限定）
// ─────────────────────────────────────────────────────────────

export async function reassignSalesOrderAction(
  orderId: string,
  input: ReassignOrderInput,
): Promise<ActionResult<{ id: string }>> {
  const canReassign = await hasPermission(PERMISSIONS.SALES_ORDER_REASSIGN);
  if (!canReassign) return { ok: false, error: "業務轉移需要主管權限" };
  if (!input.new_rs_name.trim()) return { ok: false, error: "請填寫接手業務員姓名" };

  return reassignSalesOrder(orderId, input);
}

// ─────────────────────────────────────────────────────────────
// B-3 以舊換新串聯（linkTradeIn）
// ─────────────────────────────────────────────────────────────

export async function linkTradeInAction(
  orderId: string,
  tradeInOrderId: string,
  negativeEquityResolution?: "rolled_into_price" | "cash_topup" | null,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有修改訂單的權限" };
  if (!tradeInOrderId.trim()) return { ok: false, error: "請選擇收購訂單" };

  return linkTradeInToSalesOrder(orderId, { tradeInOrderId, negativeEquityResolution });
}

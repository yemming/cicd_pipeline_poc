"use server";

/**
 * Server actions — Transfers In-Transit Board（M04L-2）
 *
 * 純薄殼，把 domain helper 的 Result<T> 轉成 client 可以直接吃的 ok/error 形狀。
 * mutation 都需 TRANSFER_CREATE 權限（與 domain helper 一致）。
 */

import {
  clearTransferDelayed as clearDelayed,
  markTransferAsDelayed as markDelayed,
  type Result,
} from "@/domain/transfers";

export type ActionResult<T = unknown> = Result<T>;

export async function markTransferAsDelayedAction(
  id: string,
  reason?: string,
): Promise<ActionResult<{ id: string }>> {
  return markDelayed(id, reason);
}

export async function clearTransferDelayedAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  return clearDelayed(id);
}

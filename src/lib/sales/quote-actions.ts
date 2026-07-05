"use server";

/**
 * Server Actions — Sales Quotes（賞車報價單）
 *
 * 所有 action 回傳 ActionResult<T>（client 自控導航，不 redirect）。
 * 權限守衛：reuse SALES_ORDER_VIEW/EDIT — 報價與訂單為同一業務流。
 *
 * RS04（2026-07-03 Russell 裁示）：報價階段完全不涉及折扣管控（業界共識，
 * 防止跨店比價）。折扣審核唯一觸發點是 createSalesOrder()（成交確認時），
 * 本檔不再做任何折扣 authority check / 自動送審。
 */

import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  createSalesQuote,
  updateSalesQuote,
  setSalesQuoteStatus,
  deleteSalesQuote,
  type CreateSalesQuoteInput,
  type UpdateSalesQuoteInput,
  type QuoteStatus,
} from "@/domain/sales-quote";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────

export async function createSalesQuoteAction(
  input: CreateSalesQuoteInput,
): Promise<ActionResult<{ id: string; quote_no: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有建立報價單的權限" };
  return createSalesQuote(input);
}

// ─────────────────────────────────────────────────────────────
// Update
// ─────────────────────────────────────────────────────────────

export async function updateSalesQuoteAction(
  id: string,
  patch: UpdateSalesQuoteInput,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有修改報價單的權限" };
  return updateSalesQuote(id, patch);
}

// ─────────────────────────────────────────────────────────────
// Set status
// ─────────────────────────────────────────────────────────────

export async function setSalesQuoteStatusAction(
  id: string,
  status: QuoteStatus,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有更新報價單狀態的權限" };
  return setSalesQuoteStatus(id, status);
}

// ─────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────

export async function deleteSalesQuoteAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有刪除報價單的權限" };
  return deleteSalesQuote(id);
}

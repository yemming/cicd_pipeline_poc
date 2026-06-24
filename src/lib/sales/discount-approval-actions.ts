"use server";

/**
 * Server Actions — Discount Approvals（報價折扣超授權審核）
 *
 * 業務員端：createDiscountApprovalAction（送審）
 * 主管端：decideDiscountApprovalAction（核准 / 駁回）
 * Admin 端：escalateDiscountApprovalAction（升級代理審核人，帶通知）
 * 設定端：upsertBackupApproverAction / removeBackupApproverAction（代理審核人 RS_M3）
 *
 * 通知：送審 → 推 LINE 給主管；升級 → 推給代理審核人；決定 → 推 LINE 給業務員。
 */

import { after } from "next/server";
import { hasPermission, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { notifications } from "@/lib/notifications";
import {
  createDiscountApproval,
  decideDiscountApproval,
  escalateDiscountApproval,
  getDiscountApprovalById,
  upsertBackupApprover,
  removeBackupApprover,
  type CreateDiscountApprovalInput,
  type DecideDiscountApprovalInput,
  type UpsertBackupApproverInput,
} from "@/domain/discount-approvals";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// 業務員：送審折扣申請
// ─────────────────────────────────────────────────────────────

export async function createDiscountApprovalAction(
  input: CreateDiscountApprovalInput,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有送審折扣申請的權限" };

  const res = await createDiscountApproval(input);
  if (!res.ok) return res;

  // 非阻塞：通知主管有新的折扣審核申請
  after(async () => {
    try {
      await notifications.dispatch({
        code: "sales_discount.requested",
        payload: {
          approvalId: res.data.id,
          quoteId: input.quote_id,
          discountPct: String(input.discount_pct),
          discountAmount: String(input.discount_amount),
          inStoreWaiting: input.in_store_waiting ? "是（客戶在場）" : "否",
          vehicleModelName: input.vehicle_model_name ?? "—",
          notes: input.notes ?? "—",
          actionUrl: `/admin/approvals/discount`,
        },
      });
    } catch {
      // 通知失敗不影響主流程
    }
  });

  return res;
}

// ─────────────────────────────────────────────────────────────
// 主管：核准 / 駁回
// ─────────────────────────────────────────────────────────────

export async function decideDiscountApprovalAction(
  id: string,
  input: DecideDiscountApprovalInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_APPROVE);

  const res = await decideDiscountApproval(id, input);
  if (!res.ok) return res;

  // 非阻塞：通知業務員審核結果
  after(async () => {
    try {
      await notifications.dispatch({
        code: "sales_discount.decided",
        payload: {
          approvalId: id,
          decision: input.decision === "approved" ? "✓ 已核准" : "✗ 已駁回",
          reason: input.reason ?? "—",
          actionUrl: `/admin/approvals/discount`,
          vehicleModelName: "—",
        },
      });
    } catch {
      // 通知失敗不影響主流程
    }
  });

  return res;
}

// ─────────────────────────────────────────────────────────────
// 升級到代理審核人
// ─────────────────────────────────────────────────────────────

export async function escalateDiscountApprovalAction(
  id: string,
  escalatedToUserId: string,
  /** 從 cron 呼叫時傳入：逾時分鐘數、代理審核人名稱（避免二次 DB 查詢） */
  ctx?: {
    overdueMinutes?: number;
    escalatedToName?: string;
    discountPct?: number;
    discountAmount?: number;
    vehicleModelName?: string;
    quoteId?: string;
  },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_APPROVE);

  const res = await escalateDiscountApproval(id, escalatedToUserId);
  if (!res.ok) return res;

  // 非阻塞：通知代理審核人
  after(async () => {
    try {
      // 若 ctx 未提供，補撈 approval 詳情
      let meta = ctx;
      if (!meta?.discountPct) {
        const row = await getDiscountApprovalById(id);
        if (row) {
          const requestedMs = new Date(row.requested_at).getTime();
          meta = {
            overdueMinutes: Math.floor((Date.now() - requestedMs) / 60000),
            escalatedToName: ctx?.escalatedToName,
            discountPct: row.discount_pct ?? 0,
            discountAmount: row.discount_amount ?? 0,
            vehicleModelName:
              row.vehicle_model_name ??
              (row.metadata as Record<string, unknown>)?.vehicle_model_name as string | undefined ??
              "—",
            quoteId: row.quote_id ?? undefined,
          };
        }
      }
      await notifications.dispatch({
        code: "sales_discount.escalated",
        payload: {
          approvalId: id,
          quoteId: meta?.quoteId ?? "—",
          discountPct: String(meta?.discountPct ?? "—"),
          discountAmount: String(meta?.discountAmount ?? ""),
          vehicleModelName: meta?.vehicleModelName ?? "—",
          overdueMinutes: String(meta?.overdueMinutes ?? "—"),
          escalatedToName: meta?.escalatedToName ?? "（代理審核人）",
          actionUrl: `/admin/approvals/discount`,
        },
      });
    } catch {
      // 通知失敗不影響主流程
    }
  });

  return res;
}

// ─────────────────────────────────────────────────────────────
// 代理審核人設定（RS_M3）
// ─────────────────────────────────────────────────────────────

export async function upsertBackupApproverAction(
  input: UpsertBackupApproverInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_APPROVE);
  return upsertBackupApprover(input);
}

export async function removeBackupApproverAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_APPROVE);
  return removeBackupApprover(id);
}

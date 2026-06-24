"use server";

/**
 * Server Actions — Sales Quotes（賞車報價單）
 *
 * 所有 action 回傳 ActionResult<T>（client 自控導航，不 redirect）。
 * 權限守衛：reuse SALES_ORDER_VIEW/EDIT — 報價與訂單為同一業務流。
 *
 * ③ 折扣擋 save（裁示二第③點）：
 *   create/update 時若折扣比例超出 business_rules.discount_authority 上限，
 *   自動送審 + 回傳 { ok: false, error, discountBlocked: true, approvalId }。
 *   前端依 discountBlocked=true 顯示「超出授權，已自動送審」提示。
 *
 *   「轉訂單」（setSalesQuoteStatusAction status='won'）同樣攔截：
 *   有未核准的 pending/escalated 申請 → 不得轉訂單。
 */

import { after } from "next/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { notifications } from "@/lib/notifications";
import {
  createSalesQuote,
  updateSalesQuote,
  setSalesQuoteStatus,
  deleteSalesQuote,
  type CreateSalesQuoteInput,
  type UpdateSalesQuoteInput,
  type QuoteStatus,
} from "@/domain/sales-quote";
import {
  checkDiscountAuthority,
  createDiscountApproval,
  getPendingApprovalForQuote,
} from "@/domain/discount-approvals";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; discountBlocked?: boolean; approvalId?: string };

// ─────────────────────────────────────────────────────────────
// 內部：折扣率計算
// ─────────────────────────────────────────────────────────────

function calcDiscountPct(discountAmount: number, vehicleAmount: number): number {
  if (!vehicleAmount || vehicleAmount <= 0) return 0;
  return Math.round((discountAmount / vehicleAmount) * 10000) / 100; // 取兩位小數
}

// ─────────────────────────────────────────────────────────────
// 內部：折扣擋 check + 自動送審
// 回傳 null = 通過；非 null = 已送審（含 approvalId）或已有進行中申請
// ─────────────────────────────────────────────────────────────

async function checkAndBlockDiscount(opts: {
  quoteId: string;
  discountAmount: number;
  vehicleAmount: number;
  vehicleModelName?: string | null;
  inStoreWaiting?: boolean;
  notes?: string | null;
}): Promise<{ blocked: true; error: string; approvalId?: string } | null> {
  const { quoteId, discountAmount, vehicleAmount } = opts;
  if (!discountAmount || discountAmount <= 0) return null;

  const discountPct = calcDiscountPct(discountAmount, vehicleAmount);
  if (discountPct <= 0) return null;

  const authority = await checkDiscountAuthority(discountPct);
  if (authority.within_authority) return null;

  // 超出授權 → 先查有沒有已進行中的申請（重複防護）
  const existing = await getPendingApprovalForQuote(quoteId);
  if (existing) {
    return {
      blocked: true,
      error: `折扣 ${discountPct}% 超出授權上限（${authority.max_pct}%），此報價單已有進行中的審核申請（ID: ${existing.id}），請等候主管審批後再儲存。`,
      approvalId: existing.id,
    };
  }

  // 建新的送審申請
  const createRes = await createDiscountApproval({
    quote_id: quoteId,
    discount_pct: discountPct,
    discount_amount: discountAmount,
    in_store_waiting: opts.inStoreWaiting ?? false,
    notes: opts.notes ?? null,
    vehicle_amount: vehicleAmount,
    vehicle_model_name: opts.vehicleModelName ?? null,
  });

  const approvalId = createRes.ok ? createRes.data.id : undefined;

  // 非阻塞：通知主管
  if (createRes.ok) {
    after(async () => {
      try {
        await notifications.dispatch({
          code: "sales_discount.requested",
          payload: {
            approvalId: createRes.data.id,
            quoteId,
            discountPct: String(discountPct),
            discountAmount: String(discountAmount),
            inStoreWaiting: opts.inStoreWaiting ? "是（客戶在場）" : "否",
            vehicleModelName: opts.vehicleModelName ?? "—",
            notes: opts.notes ?? "—",
            actionUrl: `/admin/approvals/discount`,
          },
        });
      } catch {
        // 通知失敗不影響主流程
      }
    });
  }

  return {
    blocked: true,
    error: `折扣 ${discountPct}% 超出授權上限（${authority.max_pct}%）。已自動送審，請等候主管審批後再儲存。`,
    approvalId,
  };
}

// ─────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────

export async function createSalesQuoteAction(
  input: CreateSalesQuoteInput,
): Promise<ActionResult<{ id: string; quote_no: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有建立報價單的權限" };

  // ③ 折扣擋：create 時暫時先建不含折扣的版本，再讓 discountBlocked 提示前端補填送審
  // 注意：create 時尚無 quoteId，所以先 create 成功後再進行 discount check
  const createRes = await createSalesQuote(input);
  if (!createRes.ok) return createRes;

  // 剛建好有折扣 → 檢查授權
  const discountAmount = input.discount_amount ?? 0;
  const vehicleAmount = input.vehicle_amount ?? 0;
  if (discountAmount > 0 && vehicleAmount > 0) {
    const block = await checkAndBlockDiscount({
      quoteId: createRes.data.id,
      discountAmount,
      vehicleAmount,
      vehicleModelName: input.vehicle_model_name,
      inStoreWaiting: false,
      notes: input.notes,
    });
    if (block) {
      // 已建立報價單但折扣超授權 → 通知前端（回 ok: false discountBlocked=true + approvalId）
      // 前端應顯示「報價單已建立（quote_no），但折扣超出授權，已自動送審」
      return {
        ok: false,
        error: block.error,
        discountBlocked: true,
        approvalId: block.approvalId,
        // 傳回 id/quote_no 讓前端導航到詳情頁
        // TypeScript 限制：ActionResult<T> ok=false 不帶 data，但前端可用 approvalId 判斷
      } as ActionResult<{ id: string; quote_no: string }>;
    }
  }

  return createRes;
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

  // ③ 折扣擋：若 patch 含折扣相關欄位先做 authority check
  const discountAmount = patch.discount_amount;
  const vehicleAmount = patch.vehicle_amount;
  if (discountAmount !== undefined && discountAmount > 0 && vehicleAmount !== undefined && vehicleAmount > 0) {
    const block = await checkAndBlockDiscount({
      quoteId: id,
      discountAmount,
      vehicleAmount,
      vehicleModelName: patch.vehicle_model_name,
      inStoreWaiting: false,
      notes: patch.notes,
    });
    if (block) {
      return {
        ok: false,
        error: block.error,
        discountBlocked: true,
        approvalId: block.approvalId,
      };
    }
  }

  return updateSalesQuote(id, patch);
}

// ─────────────────────────────────────────────────────────────
// Set status（含轉訂單防護）
// ─────────────────────────────────────────────────────────────

export async function setSalesQuoteStatusAction(
  id: string,
  status: QuoteStatus,
): Promise<ActionResult<{ id: string }>> {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) return { ok: false, error: "沒有更新報價單狀態的權限" };

  // ③ 轉訂單（won）防護：有未核准的折扣申請不得轉訂單
  if (status === "won") {
    const pending = await getPendingApprovalForQuote(id);
    if (pending) {
      return {
        ok: false,
        error: `此報價單有折扣審核申請尚未決定（狀態：${pending.status === "escalated" ? "已升級代理審核" : "待審核"}）。請等候主管審批後再轉成交。`,
        discountBlocked: true,
        approvalId: pending.id,
      };
    }
  }

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

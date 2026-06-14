"use server";

import { revalidatePath } from "next/cache";
import { decideApproval, requestApproval } from "@/domain/aftersales-approvals";
import type { DecideApprovalInput } from "@/domain/aftersales-approvals.constants";

const PAGE_BASE = "/parts/aftersales/approvals";

type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/**
 * decideApprovalAction — 主管核准 / 拒絕授權申請。
 * 只有 is_dept_manager || is_cross_admin 可成功（domain helper 已守門）。
 */
export async function decideApprovalAction(
  input: DecideApprovalInput,
): Promise<ActionResult<{ approval_id: string }>> {
  const res = await decideApproval(input);
  if (res.ok) {
    revalidatePath(`${PAGE_BASE}/${input.ro_id}`);
  }
  return res;
}

/**
 * requestWarrantyGraceAction — SA 申請保固通融（情境 warranty_grace）。
 */
export async function requestWarrantyGraceAction(
  roId: string,
  notes: string,
): Promise<ActionResult<{ approval_id: string }>> {
  const res = await requestApproval({
    ro_id: roId,
    scenario: "warranty_grace",
    notes,
    context: {},
  });
  if (res.ok) {
    revalidatePath(`${PAGE_BASE}/${roId}`);
  }
  return res;
}

// requestCancelOrderApprovalAction 和 requestFeeUnlockApprovalAction
// 已移至 @/lib/aftersales/approval-request-actions（跨路由 client 可 import 的 server action）

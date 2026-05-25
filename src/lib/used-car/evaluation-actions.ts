"use server";

/**
 * 中古車評估鑑價 server actions — ActionResult<T> pattern（不 redirect）。
 * UI 自控導航，server 只回 ok/error；對應 P1-#7 / P1-#8 第七輪 BDN。
 */

import { revalidatePath } from "next/cache";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  createEvaluation,
  updateEvaluation,
  submitEvaluation,
  approveEvaluation,
  rejectEvaluation,
  deleteEvaluation,
  genEvalNo,
} from "@/domain/used-car-evaluations";
import type { CreateEvaluationInput } from "@/domain/used-car-evaluations";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ── 建立評估單（draft） ──
export async function createEvaluationAction(
  input: Omit<CreateEvaluationInput, "brand_id" | "eval_no"> & {
    brand_id?: string;
    eval_no?: string | null;
  }
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getCurrentUserAndAdmin();
    if (!ctx.userId) return { ok: false, error: "請先登入" };

    if (!input.model?.trim() && !input.vin?.trim() && !input.license_plate?.trim()) {
      return { ok: false, error: "至少需要填寫車款、VIN 或車牌其中一項" };
    }

    const result = await createEvaluation({
      ...input,
      brand_id: input.brand_id ?? "indian",
      eval_no: input.eval_no ?? genEvalNo(),
      evaluator_id: ctx.userId,
      status: input.status ?? "draft",
    });
    revalidatePath("/usedcar/evaluations");
    revalidatePath("/usedcar/evaluation");
    return { ok: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "建立失敗";
    return { ok: false, error: msg };
  }
}

// ── 更新評估單 ──
export async function updateEvaluationAction(
  id: string,
  patch: Partial<CreateEvaluationInput>
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getCurrentUserAndAdmin();
    if (!ctx.userId) return { ok: false, error: "請先登入" };

    const result = await updateEvaluation(id, patch);
    revalidatePath("/usedcar/evaluations");
    revalidatePath(`/usedcar/evaluations/${id}`);
    return { ok: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "更新失敗";
    return { ok: false, error: msg };
  }
}

// ── 送簽（draft → submitted） ──
export async function submitEvaluationAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getCurrentUserAndAdmin();
    if (!ctx.userId) return { ok: false, error: "請先登入" };

    const result = await submitEvaluation(id);
    revalidatePath("/usedcar/evaluations");
    revalidatePath(`/usedcar/evaluations/${id}`);
    revalidatePath("/admin/approvals/tradein");
    return { ok: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "送簽失敗";
    return { ok: false, error: msg };
  }
}

// ── 核准（submitted → approved，需 USED_CAR_EVALUATION_APPROVE 權限） ──
export async function approveEvaluationAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getCurrentUserAndAdmin();
    if (!ctx.userId) return { ok: false, error: "請先登入" };
    const canApprove = await hasPermission(PERMISSIONS.USED_CAR_EVALUATION_APPROVE);
    if (!canApprove) return { ok: false, error: "沒有簽核評估單的權限" };

    const result = await approveEvaluation(id, ctx.userId);
    revalidatePath("/usedcar/evaluations");
    revalidatePath(`/usedcar/evaluations/${id}`);
    revalidatePath("/admin/approvals/tradein");
    revalidatePath(`/admin/approvals/tradein/${id}`);
    // 核准會同步衍生一筆中古庫存（pending_inspection）→ revalidate 庫存頁讓它立刻出現
    revalidatePath("/usedcar/stock");
    revalidatePath("/sales/showroom/used-cars");
    return { ok: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "核准失敗";
    return { ok: false, error: msg };
  }
}

// ── 駁回（submitted → rejected，需 USED_CAR_EVALUATION_APPROVE 權限） ──
export async function rejectEvaluationAction(
  id: string,
  reason: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getCurrentUserAndAdmin();
    if (!ctx.userId) return { ok: false, error: "請先登入" };
    const canApprove = await hasPermission(PERMISSIONS.USED_CAR_EVALUATION_APPROVE);
    if (!canApprove) return { ok: false, error: "沒有簽核評估單的權限" };
    if (!reason?.trim()) return { ok: false, error: "請填寫駁回原因" };

    const result = await rejectEvaluation(id, ctx.userId, reason.trim());
    revalidatePath("/usedcar/evaluations");
    revalidatePath(`/usedcar/evaluations/${id}`);
    revalidatePath("/admin/approvals/tradein");
    revalidatePath(`/admin/approvals/tradein/${id}`);
    return { ok: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "駁回失敗";
    return { ok: false, error: msg };
  }
}

// ── 刪除（draft only） ──
export async function deleteEvaluationAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getCurrentUserAndAdmin();
    if (!ctx.userId) return { ok: false, error: "請先登入" };

    await deleteEvaluation(id);
    revalidatePath("/usedcar/evaluations");
    return { ok: true, data: { id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "刪除失敗";
    return { ok: false, error: msg };
  }
}

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
  fetchEvaluationById,
  genEvalNo,
  isEvaluationExpired,
  updateEvaluationLoanClearanceDoc,
} from "@/domain/used-car-evaluations";
import { triggerUsedCarAcquisition } from "@/domain/used-purchase-requests";
import { createClient } from "@/lib/supabase/server";
import { uploadSignatureDataUrl } from "@/lib/aftersales/signature-upload";
import type { UsedCarConditionGrade } from "@/domain/used-car-inventory.constants";
import type {
  CreateEvaluationInput,
  UsedCarEvaluationWithCustomer,
} from "@/domain/used-car-evaluations";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ── 讀單筆評估（給 wizard 接 ?id= prefill 用） ──
export async function loadEvaluationForViewAction(
  id: string,
): Promise<ActionResult<UsedCarEvaluationWithCustomer>> {
  if (!id) return { ok: false, error: "缺 id" };
  try {
    const row = await fetchEvaluationById(id);
    if (!row) return { ok: false, error: "找不到評估單" };
    return { ok: true, data: row };
  } catch (e) {
    return { ok: false, error: `讀取失敗：${(e as Error).message}` };
  }
}

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
    revalidatePath("/usedcar/evaluations/wizard");
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

// ─────────────────────────────────────────────────────────────────────
// ★ T12 — RS06 收購決策真實觸發（置換 trade_in）
// ─────────────────────────────────────────────────────────────────────

const TRADEIN_GRADES: UsedCarConditionGrade[] = ["S", "A", "B", "C", "D"];

export type ConfirmTradeInInput = {
  /** 評估單 id（wizard 已存 draft 才有；用於雙向關聯 + 防重） */
  evaluation_id?: string | null;
  /** 收購決策（對映設計稿 4 選項） */
  decision: "BUY_NORMAL" | "BUY_COND" | "BUY_MGR";
  /** 從 wizard 帶上來的車輛 / 鑑價資料（避免一定要先存 draft） */
  vehicle: {
    brand_name?: string | null;
    model?: string | null;
    year?: number | null;
    vin?: string | null;
    license_plate?: string | null;
    color?: string | null;
    mileage_km?: number | null;
    condition_grade?: string | null;
  };
  /** 收購金額（建議收購報價 = market − cost） */
  acquisition_price?: number | null;
  /** 整備預估費（B 段合計） */
  recon_estimate?: number | null;
  conclusion?: string | null;
};

export type ConfirmTradeInResult = {
  evaluation_id: string | null;
  used_car_id: string;
  recon_workorder_id: string;
  ro_code: string;
};

/**
 * ★ 確認置換收購 → 呼叫共用觸發函式（acquisition_source='trade_in'）。
 *  - 建中古車主檔（pending_recon）+ 觸發 PD-UC 整備工單
 *  - 若帶 evaluation_id：回寫 eval.metadata.generated_inventory_id / decision，並防重
 *  - 回傳中古車主檔 id + 整備工單號
 */
export async function confirmTradeInAcquisitionAction(
  input: ConfirmTradeInInput,
): Promise<ActionResult<ConfirmTradeInResult>> {
  try {
    const ctx = await getCurrentUserAndAdmin();
    if (!ctx.userId) return { ok: false, error: "請先登入" };
    // 收購決策會建中古車主檔 + 工單，沿用評估簽核權限
    const canApprove = await hasPermission(PERMISSIONS.USED_CAR_EVALUATION_APPROVE);
    if (!canApprove) return { ok: false, error: "沒有確認收購的權限（需評估簽核權限）" };

    const supabase = await createClient();

    // 決定 brand：有評估單用評估單的，否則用登入者 brand（fallback indian）
    let brandId = "indian";
    let evalRow: { id: string; brand_id: string; metadata: Record<string, unknown>; eval_no: string | null } | null = null;
    if (input.evaluation_id) {
      const row = await fetchEvaluationById(input.evaluation_id);
      if (!row) return { ok: false, error: "找不到評估單" };
      evalRow = {
        id: row.id,
        brand_id: row.brand_id,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
        eval_no: row.eval_no,
      };
      brandId = row.brand_id;
      // 防重：已衍生過庫存 → 擋
      if (evalRow.metadata.generated_inventory_id) {
        return {
          ok: false,
          error: "此評估單已確認收購（中古車主檔已建立），請勿重複觸發。",
        };
      }
      // 輪7-2：過期鑑價（expires_at < now）→ 擋，要求重新鑑價
      if (isEvaluationExpired(row)) {
        return {
          ok: false,
          error: `此鑑價單已逾有效期（30 天）。請重新送鑑，取得新的核准估價後再執行收購。`,
        };
      }
    } else {
      const { data: pb } = await supabase
        .from("profile_brands")
        .select("brand_id")
        .eq("user_id", ctx.userId)
        .limit(1)
        .maybeSingle();
      brandId = pb?.brand_id ?? "indian";
    }

    const v = input.vehicle;
    const modelName =
      v.model?.trim() ||
      [v.brand_name?.trim(), "未指定車款"].filter(Boolean).join(" ") ||
      "（未指定）";
    const grade =
      v.condition_grade && TRADEIN_GRADES.includes(v.condition_grade as UsedCarConditionGrade)
        ? (v.condition_grade as UsedCarConditionGrade)
        : null;

    // ── 呼叫共用觸發函式（trade_in）──
    const trigger = await triggerUsedCarAcquisition({
      brand_id: brandId,
      model_display_name: modelName,
      year: v.year ?? new Date().getFullYear(),
      acquisition_source: "trade_in",
      acquisition_price: input.acquisition_price ?? null,
      vin: v.vin,
      license_plate: v.license_plate,
      color: v.color,
      mileage_km: v.mileage_km,
      condition_grade: grade,
      recon_estimate: input.recon_estimate ?? null,
      note: input.conclusion ?? null,
      created_by: ctx.userId,
      source_kind: "evaluation",
      source_id: evalRow?.id ?? "manual",
      source_no: evalRow?.eval_no ?? null,
      conditional: input.decision === "BUY_COND",
    });

    // ── 雙向回寫評估單 metadata（若有評估單）──
    if (evalRow) {
      const mergedMeta = {
        ...evalRow.metadata,
        generated_inventory_id: trigger.used_car_id,
        generated_recon_workorder_id: trigger.recon_workorder_id,
        purchase_decision_code: input.decision,
      };
      const { error: backErr } = await supabase
        .from("used_car_evaluations")
        .update({ metadata: mergedMeta, decision: input.decision })
        .eq("id", evalRow.id);
      if (backErr) {
        console.error(
          `confirmTradeInAcquisitionAction: 回寫評估單 metadata 失敗（不影響主結果）— ${backErr.message}`,
        );
      }
    }

    revalidatePath("/usedcar/evaluations");
    if (input.evaluation_id) {
      revalidatePath(`/usedcar/evaluations/${input.evaluation_id}`);
      revalidatePath("/usedcar/evaluations/wizard");
    }
    revalidatePath("/usedcar/stock");
    revalidatePath("/sales/showroom/used-cars");
    revalidatePath("/parts/aftersales/repair-orders");

    return {
      ok: true,
      data: {
        evaluation_id: evalRow?.id ?? null,
        used_car_id: trigger.used_car_id,
        recon_workorder_id: trigger.recon_workorder_id,
        ro_code: trigger.ro_code,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "確認收購失敗";
    return { ok: false, error: msg };
  }
}

// ─────────────────────────────────────────────────────────────────────
// 輪7-4 — 貸款清償證明文件上傳
// ─────────────────────────────────────────────────────────────────────

/**
 * 上傳貸款清償證明圖片到 Storage，並將公開 URL 寫入評估單 loan_clearance_doc_url。
 *
 * 前端傳入 base64 dataURL（JPEG 或 PNG），server action 負責：
 *   1. 呼叫 uploadSignatureDataUrl（借用 ro-signatures bucket，entity='loan-clearance'）
 *   2. 將回傳的 URL 寫進 used_car_evaluations.loan_clearance_doc_url
 *   3. DB 只存 URL，不存 base64（與簽名上傳規範一致）
 */
export async function uploadLoanClearanceDocAction(
  evaluationId: string,
  dataUrl: string,
): Promise<ActionResult<{ url: string }>> {
  if (!evaluationId) return { ok: false, error: "缺少評估單 id" };
  if (!dataUrl?.startsWith("data:")) {
    // 若已是 URL（代表已上傳過），直接更新記錄即可
    if (dataUrl?.startsWith("http")) {
      try {
        await updateEvaluationLoanClearanceDoc(evaluationId, dataUrl);
        return { ok: true, data: { url: dataUrl } };
      } catch (e) {
        return { ok: false, error: `更新失敗：${(e as Error).message}` };
      }
    }
    return { ok: false, error: "請提供有效的圖片 dataURL 或 Storage URL" };
  }

  try {
    const ctx = await getCurrentUserAndAdmin();
    if (!ctx.userId) return { ok: false, error: "請先登入" };

    // 取得評估單 brand（用於 Storage 路徑前綴）
    const row = await fetchEvaluationById(evaluationId);
    if (!row) return { ok: false, error: "找不到評估單" };

    const url = await uploadSignatureDataUrl(
      dataUrl,
      row.brand_id,
      "loan-clearance",
      evaluationId,
      "doc",
    );
    if (!url) {
      return { ok: false, error: "圖片上傳失敗，請稍後再試" };
    }

    await updateEvaluationLoanClearanceDoc(evaluationId, url);
    revalidatePath(`/usedcar/evaluations/${evaluationId}`);
    revalidatePath("/usedcar/evaluations");
    return { ok: true, data: { url } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "上傳失敗";
    return { ok: false, error: msg };
  }
}

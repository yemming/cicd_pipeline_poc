"use server";

/**
 * Server actions — RS_INV05 中古車收購申請（直購）
 *
 * Result<T> pattern、無 redirect（client 自控導航）。
 * 對應頁面：/sales/inventory/used-purchase（list / wizard / detail）
 * 設計稿：docs/20260527/RS_INV05_中古車收購申請.html
 *
 * 寫入動作：
 *  - createUsedPurchaseAction：建申請單（draft，decision=null）
 *  - updateUsedPurchaseAction：更新申請單欄位
 *  - deleteUsedPurchaseAction：刪除（尚未決策的才能刪）
 *  - confirmDirectBuyAction：★ 確認收購 = 寫 decision + 呼叫共用觸發函式
 *      （acquisition_source='direct_buy'）+ 回填 used_car_id / recon_workorder_id
 *
 * 權限：
 *  - 檢視 → SALES_ORDER_VIEW
 *  - 建立 / 編輯 / 收購決策 → SALES_ORDER_EDIT
 */

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  createUsedPurchaseRequest,
  updateUsedPurchaseRequest,
  deleteUsedPurchaseRequest,
  getUsedPurchaseRequestById,
  triggerUsedCarAcquisition,
  type UsedPurchaseInput,
  type UsedPurchaseSourceType,
} from "@/domain/used-purchase-requests";
import type { UsedCarConditionGrade } from "@/domain/used-car-inventory.constants";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/sales/inventory/used-purchase";

const VALID_SOURCE: UsedPurchaseSourceType[] = ["auction", "personal", "dealer", "other"];
const VALID_GRADE: UsedCarConditionGrade[] = ["A", "B", "C", "D"];

export type UsedPurchaseFormInput = {
  source_type?: string | null;
  seller_name?: string | null;
  seller_phone?: string | null;
  seller_id_no?: string | null;
  vin?: string | null;
  vehicle_model_name?: string | null; // 自由文字車型（塞 metadata）
  brand_name?: string | null;
  year?: number | null;
  color?: string | null;
  mileage_km?: number | null;
  grade_ext?: string | null;
  grade_mech?: string | null;
  market_ref_price?: number | null;
  recon_estimate?: number | null;
  suggested_price?: number | null;
  actual_price?: number | null;
  accident_flag?: boolean | null;
  accident_note?: string | null;
  market_source_note?: string | null;
  note?: string | null;
};

/** 把 form input normalize 成 domain UsedPurchaseInput（剔除非法 enum）。 */
function normalizeInput(
  brand_id: string,
  form: UsedPurchaseFormInput,
  createdBy: string | null,
): UsedPurchaseInput {
  const sourceType =
    form.source_type && VALID_SOURCE.includes(form.source_type as UsedPurchaseSourceType)
      ? (form.source_type as UsedPurchaseSourceType)
      : null;
  const gradeExt =
    form.grade_ext && VALID_GRADE.includes(form.grade_ext as UsedCarConditionGrade)
      ? (form.grade_ext as UsedCarConditionGrade)
      : null;
  const gradeMech =
    form.grade_mech && VALID_GRADE.includes(form.grade_mech as UsedCarConditionGrade)
      ? (form.grade_mech as UsedCarConditionGrade)
      : null;

  return {
    brand_id,
    source_type: sourceType,
    seller_name: form.seller_name?.trim() || null,
    seller_phone: form.seller_phone?.trim() || null,
    seller_id_no: form.seller_id_no?.trim() || null,
    vin: form.vin?.trim() || null,
    year: form.year ?? null,
    color: form.color?.trim() || null,
    mileage_km: form.mileage_km ?? null,
    grade_ext: gradeExt,
    grade_mech: gradeMech,
    market_ref_price: form.market_ref_price ?? null,
    recon_estimate: form.recon_estimate ?? null,
    suggested_price: form.suggested_price ?? null,
    actual_price: form.actual_price ?? null,
    created_by: createdBy,
    vehicle_model_name: form.vehicle_model_name?.trim() || null,
    metadata: {
      brand_name: form.brand_name?.trim() || null,
      accident_flag: form.accident_flag ?? false,
      accident_note: form.accident_note?.trim() || null,
      market_source_note: form.market_source_note?.trim() || null,
      note: form.note?.trim() || null,
    },
  };
}

/** 基本必填 guard（建單 / 收購前都跑）。 */
function validateForm(form: UsedPurchaseFormInput): string | null {
  if (!form.seller_name?.trim()) return "請填寫賣方姓名 / 公司名稱";
  if (!form.vin?.trim() && !form.vehicle_model_name?.trim())
    return "請至少填寫 VIN 或車型其中一項";
  return null;
}

export async function createUsedPurchaseAction(
  form: UsedPurchaseFormInput,
): Promise<ActionResult<{ id: string; application_no: string }>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_EDIT);
  const err = validateForm(form);
  if (err) return { ok: false, error: err };

  try {
    const brand = (await getActiveScope()).brand_id;
    const { userId } = await getCurrentUserAndAdmin();
    const input = normalizeInput(brand, form, userId);
    const res = await createUsedPurchaseRequest(input);
    revalidatePath(PAGE_PATH);
    revalidatePath(`${PAGE_PATH}/${res.id}`);
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, error: `建立失敗：${(e as Error).message}` };
  }
}

export async function updateUsedPurchaseAction(
  id: string,
  form: UsedPurchaseFormInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };

  try {
    const brand = (await getActiveScope()).brand_id;
    const { userId } = await getCurrentUserAndAdmin();
    const input = normalizeInput(brand, form, userId);
    // update 不改 application_no / created_by / brand_id
    const { application_no: _a, created_by: _c, brand_id: _b, ...patch } = input;
    void _a;
    void _c;
    void _b;
    const res = await updateUsedPurchaseRequest(id, patch);
    revalidatePath(PAGE_PATH);
    revalidatePath(`${PAGE_PATH}/${id}`);
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, error: `更新失敗：${(e as Error).message}` };
  }
}

export async function deleteUsedPurchaseAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  try {
    await deleteUsedPurchaseRequest(id);
    revalidatePath(PAGE_PATH);
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: `刪除失敗：${(e as Error).message}` };
  }
}

export type ConfirmDirectBuyInput = {
  /** 申請單 id（已存過 draft 才有；wizard 一鍵收購時可先建單再確認） */
  request_id?: string | null;
  /** 若還沒建單，帶完整 form 一起建 */
  form?: UsedPurchaseFormInput;
  /** 收購決策：approved（正常收購）/ conditional（條件收購） — rejected 走 rejectUsedPurchaseAction */
  decision: "approved" | "conditional";
};

export type ConfirmDirectBuyResult = {
  request_id: string;
  application_no: string;
  used_car_id: string;
  recon_workorder_id: string;
  ro_code: string;
};

/**
 * ★ 確認直購收購：
 *  1. 若還沒建單 → 先建一筆 draft
 *  2. 防重：已決策過（decision 非 null / 已有 used_car_id）的直接擋
 *  3. 呼叫共用觸發函式 triggerUsedCarAcquisition（acquisition_source='direct_buy'）
 *  4. 回寫 used_purchase_requests.decision / used_car_id / recon_workorder_id
 *  5. 回傳中古車主檔 id + 整備工單號
 */
export async function confirmDirectBuyAction(
  input: ConfirmDirectBuyInput,
): Promise<ActionResult<ConfirmDirectBuyResult>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_EDIT);

  const brand = (await getActiveScope()).brand_id;
  const { userId } = await getCurrentUserAndAdmin();

  try {
    // ── 1. 確保有申請單 ──
    let requestId = input.request_id ?? null;
    let applicationNo = "";
    if (!requestId) {
      if (!input.form) return { ok: false, error: "缺少申請資料" };
      const err = validateForm(input.form);
      if (err) return { ok: false, error: err };
      const created = await createUsedPurchaseRequest(
        normalizeInput(brand, input.form, userId),
      );
      requestId = created.id;
      applicationNo = created.application_no;
    }

    // ── 2. 撈申請單 + 防重 ──
    const req = await getUsedPurchaseRequestById(requestId);
    if (!req) return { ok: false, error: "找不到申請單" };
    if (req.brand_id !== brand)
      return { ok: false, error: "申請單不屬於當前 brand" };
    if (req.used_car_id || req.decision === "approved" || req.decision === "conditional") {
      return {
        ok: false,
        error: `此申請單已收購（中古車主檔已建立），請勿重複確認。`,
      };
    }
    if (!applicationNo) applicationNo = req.application_no;

    // ── 3. 呼叫共用觸發函式（direct_buy）──
    const meta = (req.metadata ?? {}) as Record<string, unknown>;
    const modelName =
      (typeof meta.vehicle_model_name === "string" && meta.vehicle_model_name) ||
      (typeof meta.brand_name === "string" && meta.brand_name) ||
      req.vin ||
      "（未指定車款）";
    const trigger = await triggerUsedCarAcquisition({
      brand_id: brand,
      model_display_name: modelName,
      year: req.year ?? new Date().getFullYear(),
      acquisition_source: "direct_buy",
      acquisition_price: req.actual_price ?? req.suggested_price ?? null,
      vin: req.vin,
      color: req.color,
      mileage_km: req.mileage_km,
      // 直購用「車身外觀等級」當主檔 condition_grade（A-D 同 enum）
      condition_grade: req.grade_ext,
      vehicle_model_id: req.vehicle_model_id,
      recon_estimate: req.recon_estimate,
      note: typeof meta.note === "string" ? meta.note : null,
      created_by: userId,
      source_kind: "used_purchase_request",
      source_id: requestId,
      source_no: applicationNo,
      conditional: input.decision === "conditional",
    });

    // ── 4. 回寫申請單 decision + used_car_id + recon_workorder_id ──
    await updateUsedPurchaseRequest(requestId, {
      decision: input.decision === "conditional" ? "conditional" : "approved",
    });
    // used_car_id / recon_workorder_id 不在 UsedPurchaseInput 型別，直接 supabase 回寫
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase
      .from("used_purchase_requests")
      .update({
        used_car_id: trigger.used_car_id,
        recon_workorder_id: trigger.recon_workorder_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("brand_id", brand);

    revalidatePath(PAGE_PATH);
    revalidatePath(`${PAGE_PATH}/${requestId}`);
    revalidatePath("/usedcar/stock");
    revalidatePath("/sales/showroom/used-cars");
    revalidatePath("/parts/aftersales/repair-orders");

    return {
      ok: true,
      data: {
        request_id: requestId,
        application_no: applicationNo,
        used_car_id: trigger.used_car_id,
        recon_workorder_id: trigger.recon_workorder_id,
        ro_code: trigger.ro_code,
      },
    };
  } catch (e) {
    return { ok: false, error: `收購確認失敗：${(e as Error).message}` };
  }
}

/** 不收購：寫 decision=rejected，不建任何主檔 / 工單。 */
export async function rejectUsedPurchaseAction(
  input: { request_id?: string | null; form?: UsedPurchaseFormInput },
): Promise<ActionResult<{ request_id: string; application_no: string }>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_EDIT);
  const brand = (await getActiveScope()).brand_id;
  const { userId } = await getCurrentUserAndAdmin();

  try {
    let requestId = input.request_id ?? null;
    let applicationNo = "";
    if (!requestId) {
      if (!input.form) return { ok: false, error: "缺少申請資料" };
      const err = validateForm(input.form);
      if (err) return { ok: false, error: err };
      const created = await createUsedPurchaseRequest(
        normalizeInput(brand, input.form, userId),
      );
      requestId = created.id;
      applicationNo = created.application_no;
    }
    const req = await getUsedPurchaseRequestById(requestId);
    if (!req) return { ok: false, error: "找不到申請單" };
    if (req.used_car_id)
      return { ok: false, error: "此申請單已收購，無法改為不收購" };
    if (!applicationNo) applicationNo = req.application_no;

    await updateUsedPurchaseRequest(requestId, { decision: "rejected" });
    revalidatePath(PAGE_PATH);
    revalidatePath(`${PAGE_PATH}/${requestId}`);
    return { ok: true, data: { request_id: requestId, application_no: applicationNo } };
  } catch (e) {
    return { ok: false, error: `操作失敗：${(e as Error).message}` };
  }
}

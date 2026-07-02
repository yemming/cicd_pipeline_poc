"use server";

/**
 * 中古車庫存 server actions — ActionResult<T> pattern（不 redirect）。
 * UI 自控導航，server 只回 ok/error。
 */

import { createUsedCar, updateUsedCar, deleteUsedCar, setUsedCarStatus } from "@/domain/used-car-inventory";
import type { CreateUsedCarInput, UsedCarInventoryRow } from "@/domain/used-car-inventory";
import type { UsedCarDbStatus, ConditionReport } from "@/domain/used-car-inventory.constants";
import { uploadSignatureDataUrl, isStorageUrl } from "@/lib/aftersales/signature-upload";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ── 建立 ──
export async function createUsedCarAction(
  input: CreateUsedCarInput
): Promise<ActionResult<{ id: string }>> {
  try {
    if (!input.model_display_name?.trim()) {
      return { ok: false, error: "車款名稱不可為空" };
    }
    if (!input.year || input.year < 1990 || input.year > new Date().getFullYear() + 1) {
      return { ok: false, error: "請輸入正確的年份" };
    }
    const result = await createUsedCar(input);
    return { ok: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "建立失敗";
    if (msg.includes("23505")) return { ok: false, error: "VIN 號碼重複，請確認後重新輸入" };
    return { ok: false, error: msg };
  }
}

// ── 更新 ──
export async function updateUsedCarAction(
  id: string,
  patch: Partial<CreateUsedCarInput>
): Promise<ActionResult<{ id: string }>> {
  try {
    if (patch.model_display_name !== undefined && !patch.model_display_name?.trim()) {
      return { ok: false, error: "車款名稱不可為空" };
    }
    const result = await updateUsedCar(id, patch);
    return { ok: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "更新失敗";
    if (msg.includes("23505")) return { ok: false, error: "VIN 號碼重複，請確認後重新輸入" };
    return { ok: false, error: msg };
  }
}

// ── 狀態切換 ──
export async function setUsedCarStatusAction(
  id: string,
  status: UsedCarDbStatus,
  soldDate?: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const result = await setUsedCarStatus(id, status, soldDate);
    return { ok: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "狀態切換失敗";
    return { ok: false, error: msg };
  }
}

// ── 刪除 ──
export async function deleteUsedCarAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    await deleteUsedCar(id);
    return { ok: true, data: { id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "刪除失敗";
    return { ok: false, error: msg };
  }
}

// ── 輪9 車況說明書儲存 action ──────────────────────────────────────────

/**
 * 儲存車況說明書（condition_report）到 used_car_inventory.metadata.condition_report。
 *
 * 業務員不可改 accident_history / flood_damage（技師欄位），前後端雙重保護：
 *   - 前端：表單不渲染這兩欄 input
 *   - 後端：此 action 從 DB 讀取現有值再 merge，強制保留技師欄位原值
 *
 * 客戶簽名：若傳入 dataUrl（base64），先上傳到 Storage，DB 只存 URL。
 * 簽名同時記錄 customer_acknowledged_at（Asia/Taipei 時間）。
 */
export type SaveConditionReportInput = {
  /** 車輛 id */
  used_car_id: string;
  /** 業務員可編輯的欄位（不含 accident_history / flood_damage） */
  modification?: string | null;
  odometer_reliable?: boolean | null;
  inspection_summary?: string | null;
  additional_notes?: string | null;
  source_pdi_id?: string | null;
  /**
   * 客戶簽名（base64 dataUrl 或已上傳的 Storage URL）。
   * 傳入 dataUrl 時會自動上傳，傳入已有 URL 直接存，不傳則不變。
   */
  customer_signature?: string | null;
  /** brand_id（給 Storage bucket 路徑用）*/
  brand_id: string;
};

export async function saveConditionReportAction(
  input: SaveConditionReportInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const { userId } = await getCurrentUserAndAdmin();
    const supabase = await createClient();

    // 1) 讀現有 metadata（保留技師欄位）
    const { data: existing, error: fetchErr } = await supabase
      .from("used_car_inventory")
      .select("metadata")
      .eq("id", input.used_car_id)
      .single();
    if (fetchErr) return { ok: false, error: `載入資料失敗：${fetchErr.message}` };

    const existingMeta = (existing?.metadata as Record<string, unknown>) ?? {};
    const existingReport = (existingMeta.condition_report as Partial<ConditionReport>) ?? {};

    // 1.5) 已簽名鎖定：客戶簽過名後，業務員欄位不得再改，除非同時重新請客戶簽名
    //      （避免簽名與其擔保的內容脫鉤，維持法律效力）
    if (existingReport.customer_acknowledged_at && !input.customer_signature) {
      const editableFields: (keyof SaveConditionReportInput)[] = [
        "modification",
        "odometer_reliable",
        "inspection_summary",
        "additional_notes",
      ];
      const attemptedChange = editableFields.some(
        (f) => input[f] !== undefined && input[f] !== (existingReport[f as keyof ConditionReport] ?? null)
      );
      if (attemptedChange) {
        return { ok: false, error: "客戶已簽名確認車況說明書，如需修改內容請重新請客戶簽名" };
      }
    }

    // 2) 客戶簽名處理（dataUrl → Storage → URL）
    let signatureUrl = existingReport.customer_signature_url ?? null;
    let acknowledgedAt = existingReport.customer_acknowledged_at ?? null;
    if (input.customer_signature) {
      if (isStorageUrl(input.customer_signature)) {
        // 已是 Storage URL，直接保留
        signatureUrl = input.customer_signature;
        if (!acknowledgedAt) acknowledgedAt = new Date().toISOString();
      } else if (input.customer_signature.startsWith("data:")) {
        // base64 dataUrl，上傳到 Storage
        const uploaded = await uploadSignatureDataUrl(
          input.customer_signature,
          input.brand_id,
          "used-car-condition",
          input.used_car_id,
          "customer"
        );
        if (uploaded) {
          signatureUrl = uploaded;
          acknowledgedAt = new Date().toISOString();
        }
      }
    }

    // 3) 合併：業務員欄位 override，技師欄位保留原值（前後端雙重保護）
    const merged: ConditionReport = {
      // 技師欄位：強制保留 DB 原值，不接受 client 覆蓋
      accident_history: existingReport.accident_history ?? null,
      flood_damage: existingReport.flood_damage ?? null,
      // 業務員欄位
      modification: input.modification !== undefined ? (input.modification ?? null) : (existingReport.modification ?? null),
      odometer_reliable: input.odometer_reliable !== undefined ? (input.odometer_reliable ?? null) : (existingReport.odometer_reliable ?? null),
      inspection_summary: input.inspection_summary !== undefined ? (input.inspection_summary ?? null) : (existingReport.inspection_summary ?? null),
      additional_notes: input.additional_notes !== undefined ? (input.additional_notes ?? null) : (existingReport.additional_notes ?? null),
      source_pdi_id: input.source_pdi_id !== undefined ? (input.source_pdi_id ?? null) : (existingReport.source_pdi_id ?? null),
      // 簽名
      customer_signature_url: signatureUrl,
      customer_acknowledged_at: acknowledgedAt,
    };

    // 4) 寫回 metadata.condition_report
    const newMeta = { ...existingMeta, condition_report: merged };
    const { error: updateErr } = await supabase
      .from("used_car_inventory")
      .update({
        metadata: newMeta,
        updated_at: new Date().toISOString(),
        updated_by: userId ?? undefined,
      })
      .eq("id", input.used_car_id);
    if (updateErr) return { ok: false, error: `儲存失敗：${updateErr.message}` };

    return { ok: true, data: { id: input.used_car_id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "儲存車況說明書失敗";
    return { ok: false, error: msg };
  }
}

// ── 型別 re-export 方便 client import ──
export type { UsedCarInventoryRow };

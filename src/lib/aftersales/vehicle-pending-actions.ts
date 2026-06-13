"use server";

/**
 * Server actions — vehicle_pending_items（RP7 待處理項目）
 *
 * 四個寫入源：
 *  ①  追加項目被拒絕 / 暫緩（repair-order-addon-actions.ts decideAddonAction）
 *  ②  Quick Quote 被拒絕（service-quote-actions.ts rejectQuoteAction）
 *  ③（本檔）SA 手動新增 — 電話諮詢未進廠時用
 *  ④ 解決後標 resolved
 *
 * 安全等級（metadata.safety_level）：緊急 / 警示 / 建議
 * 二次拒絕自動升一級邏輯在 repair-order-addon-actions.ts decideAddonAction
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** SA 手動新增待處理項目輸入 */
export type AddVehiclePendingItemInput = {
  vehicle_id: string;
  item_desc: string;
  /** 安全等級：緊急 / 警示 / 建議（預設 建議） */
  safety_level?: "緊急" | "警示" | "建議";
  reason?: string | null;
  estimated_fee?: number | null;
};

/** SA 手動新增待處理項目（③ 來源：電話諮詢未進廠） */
export async function addVehiclePendingItemAction(
  input: AddVehiclePendingItemInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.INSPECTION_EDIT);

  const desc = input.item_desc?.trim();
  if (!desc) return { ok: false, error: "請填寫待處理項目說明" };
  if (!input.vehicle_id) return { ok: false, error: "缺少車輛 ID" };

  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();

  const safetyLevel = input.safety_level ?? "建議";

  const metadata: Record<string, unknown> = {
    safety_level: safetyLevel,
    source: "sa_manual",
    reject_count: 0,
  };
  if (input.estimated_fee != null) {
    metadata.estimated_fee = input.estimated_fee;
  }

  const { data, error } = await supabase
    .from("vehicle_pending_items")
    .insert({
      brand_id: brand,
      vehicle_id: input.vehicle_id,
      item_desc: desc,
      reason: input.reason?.trim() || null,
      status: "pending",
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[vehicle-pending-actions] addVehiclePendingItemAction", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/parts/aftersales/pre-inspections");
  return { ok: true, data: { id: data.id } };
}

/** 將待處理項目標記為 resolved（SA 處理完畢後） */
export async function resolveVehiclePendingItemAction(
  id: string,
  resolveNote?: string | null,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.INSPECTION_EDIT);
  if (!id) return { ok: false, error: "缺少 ID" };

  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();

  // 讀現有 metadata 以便 merge
  const { data: cur } = await supabase
    .from("vehicle_pending_items")
    .select("id, status, metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!cur) return { ok: false, error: "找不到待處理項目" };
  if (cur.status === "resolved") return { ok: false, error: "已標記為已處理" };

  const prevMeta = (cur.metadata as Record<string, unknown> | null) ?? {};
  const newMeta = {
    ...prevMeta,
    resolved_note: resolveNote?.trim() || null,
    resolved_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("vehicle_pending_items")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      metadata: newMeta,
    } as Record<string, unknown>)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/parts/aftersales/pre-inspections");
  return { ok: true, data: { id } };
}

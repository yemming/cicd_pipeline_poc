/**
 * 庫存報廢單 (inventory_writeoffs) — 純 helper / 型別模組（**非** "use server"）
 *
 * 為什麼獨立成檔：Next 的 "use server" 檔案只允許 export async server action，
 * 不能 export 型別、同步函式或常數（否則整個 module 編不出來）。
 * 所以把型別、calcApprovalTier、_syncWriteoffFromLoss 等放這裡，
 * 由 writeoff-actions.ts（server actions）與 loss-overflow-actions.ts import。
 */

import { createClient } from "@/lib/supabase/server";
import {
  APPROVAL_THRESHOLD,
  SENIOR_APPROVAL_THRESHOLD,
} from "@/domain/loss-overflow.constants";

export type WriteoffApprovalTier = "self" | "manager" | "store_manager";

export type WriteoffInput = {
  brand_id?: string;
  item_id: string;
  qty: number;
  unit_cost: number;
  writeoff_reason: string;
  source?: "manual" | "count_adjustment" | "workorder" | "return_writeoff";
  workorder_id?: string | null;
  store_id?: string | null;
};

/** 依報廢金額計算審批層級（self 倉管自批 / manager 主管 / store_manager 店長） */
export function calcApprovalTier(totalLoss: number): WriteoffApprovalTier {
  if (totalLoss >= SENIOR_APPROVAL_THRESHOLD) return "store_manager";
  if (totalLoss >= APPROVAL_THRESHOLD) return "manager";
  return "self";
}

/**
 * 內部用：當 loss-overflow 已知有 item 資料時，同步寫一筆 inventory_writeoffs。
 * 失敗靜默 log，不影響主流程。
 */
export async function _syncWriteoffFromLoss(params: {
  brand_id: string;
  item_id: string;
  qty: number;
  unit_cost: number;
  writeoff_reason: string;
  requested_by: string | null;
  store_id?: string | null;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const totalLoss = params.qty * params.unit_cost;
    const tier = calcApprovalTier(totalLoss);
    const status = tier === "self" ? "approved" : "pending";
    const now = new Date().toISOString();

    const { error } = await supabase.from("inventory_writeoffs").insert({
      brand_id: params.brand_id,
      item_id: params.item_id,
      qty: params.qty,
      unit_cost: params.unit_cost,
      total_loss: totalLoss,
      writeoff_reason: params.writeoff_reason,
      source: "count_adjustment",
      store_id: params.store_id ?? null,
      status,
      approval_tier: tier,
      requested_by: params.requested_by,
      requested_at: now,
      approved_by: tier === "self" ? params.requested_by : null,
      approved_at: tier === "self" ? now : null,
    });

    if (error) {
      console.error("[_syncWriteoffFromLoss] 寫入失敗（不影響主流程）", error.message);
    }
  } catch (e) {
    console.error("[_syncWriteoffFromLoss] 例外（不影響主流程）", e);
  }
}

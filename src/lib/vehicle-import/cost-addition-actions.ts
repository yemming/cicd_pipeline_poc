"use server";

/**
 * 進口成本補列三道關 actions（pool line + metadata.is_post_addition，不另開表）。
 *   Gate 1 申請  requestCostAdditionAction  → 建 pending pool line
 *   Gate 2 簽核  reviewCostAdditionAction   → 主管核准/退回（admin）
 *   Gate 3 套用  approved 後回工作台重新 Commit（landed-cost-actions 只納入 approved 補列）
 * 天條：UI 只 import 本 actions。
 */

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export type CostAddResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) return { error: "請先登入" };
  if (!isAdmin) return { error: "需要 admin 權限" };
  return { userId };
}

export type CostAdditionInput = {
  shipment_id: string;
  cost_type: string;
  amount: number;
  allocation_basis: "direct" | "cif" | "weight" | "qty" | "model_amort";
  is_inventoriable: boolean;
  target_vehicle_id?: string | null;
  payee?: string | null;
  reason?: string | null;
};

/** Gate 1：申請補列（建 pending pool line，標 is_post_addition） */
export async function requestCostAdditionAction(
  input: CostAdditionInput,
): Promise<CostAddResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  if (!input.shipment_id) return { ok: false, error: "請選擇批次" };
  if (!input.cost_type) return { ok: false, error: "費用類型必填" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: "金額需為正數" };
  if (input.allocation_basis === "direct" && !input.target_vehicle_id)
    return { ok: false, error: "「直接歸屬」需指定車輛" };

  const sb = createServiceClient();
  const { data: s } = await sb
    .from("import_shipments")
    .select("brand_id")
    .eq("id", input.shipment_id)
    .maybeSingle();
  if (!s) return { ok: false, error: "找不到批次" };

  const { data, error } = await sb
    .from("import_cost_pool_lines")
    .insert({
      brand_id: (s as { brand_id: string }).brand_id,
      shipment_id: input.shipment_id,
      cost_type: input.cost_type,
      amount: input.amount,
      allocation_basis: input.allocation_basis,
      is_inventoriable: input.is_inventoriable,
      target_vehicle_id: input.target_vehicle_id ?? null,
      payee: input.payee?.trim() || null,
      created_by: gate.userId,
      metadata: {
        is_post_addition: true,
        approval_status: "pending",
        reason: input.reason?.trim() || null,
        requested_by: gate.userId,
        requested_at: new Date().toISOString(),
      },
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `申請補列失敗：${error.message}` };
  revalidatePath("/vehicle-import/cost-additions", "page");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

/** Gate 2：主管簽核（核准 / 退回）。退回後該補列不會被 commit 納入。 */
export async function reviewCostAdditionAction(
  lineId: string,
  approve: boolean,
  note?: string,
): Promise<CostAddResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const sb = createServiceClient();

  const { data: row } = await sb
    .from("import_cost_pool_lines")
    .select("metadata")
    .eq("id", lineId)
    .maybeSingle();
  if (!row) return { ok: false, error: "找不到補列" };
  const m = ((row as { metadata: Record<string, unknown> | null }).metadata) ?? {};
  if (!m.is_post_addition) return { ok: false, error: "此費用不是補列項" };

  const { error } = await sb
    .from("import_cost_pool_lines")
    .update({
      metadata: {
        ...m,
        approval_status: approve ? "approved" : "rejected",
        approved_by: gate.userId,
        approved_at: new Date().toISOString(),
        review_note: note?.trim() || null,
      },
    })
    .eq("id", lineId);
  if (error) return { ok: false, error: `簽核失敗：${error.message}` };
  revalidatePath("/vehicle-import/cost-additions", "page");
  return { ok: true, data: { id: lineId } };
}

/** 刪除補列（僅 pending / rejected 可刪；approved 已可能納入分攤，禁刪以免帳不一致） */
export async function deleteCostAdditionAction(
  lineId: string,
): Promise<CostAddResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const sb = createServiceClient();
  const { data: row } = await sb
    .from("import_cost_pool_lines")
    .select("metadata")
    .eq("id", lineId)
    .maybeSingle();
  if (!row) return { ok: false, error: "找不到補列" };
  const m = ((row as { metadata: Record<string, unknown> | null }).metadata) ?? {};
  if (m.approval_status === "approved")
    return { ok: false, error: "已核准的補列不可刪除（請先在工作台重結算或沖銷）" };

  const { error } = await sb.from("import_cost_pool_lines").delete().eq("id", lineId);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath("/vehicle-import/cost-additions", "page");
  return { ok: true, data: { id: lineId } };
}

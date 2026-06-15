"use server";

/**
 * Server actions — damage_disputes（損傷客戶異議記錄）
 *
 * 此表為 append-only：只有 SELECT + INSERT RLS，無 update/delete policy。
 * 寫入後不可修改，為 7 年稽核記錄。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import type { DamageDisputeType } from "@/domain/damage-disputes";

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export type AddDamageDisputeInput = {
  pre_inspection_id: string;
  vehicle_id?: string | null;
  repair_order_id?: string | null;
  dispute_type: DamageDisputeType;
  /** 對應哪一筆環檢損傷的標籤（例：「左整流罩」） */
  damage_label: string;
  /** 客戶原話，逐字記錄不可加 SA 主觀判斷 */
  customer_words: string;
};

/** 新增損傷客戶異議記錄（append-only，不可逆）
 *
 *  - 需 PERMISSIONS.RO_CREATE 以上權限
 *  - 寫入 damage_disputes 表後 revalidate 預檢單路徑
 *  - 不允許空的 customer_words（客戶原話必填）
 */
export async function addDamageDisputeAction(
  input: AddDamageDisputeInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);

  const words = input.customer_words?.trim();
  if (!words) return { ok: false, error: "請填寫客戶原話（必填）" };
  if (!input.damage_label?.trim()) return { ok: false, error: "請指定損傷部位" };
  if (!input.pre_inspection_id) return { ok: false, error: "缺少預檢單 ID" };

  const brand = (await getActiveScope()).brand_id;
  const { userId: authorId, email } = await getCurrentUserAndAdmin();

  const supabase = await createClient();

  // 取作者姓名（from employees 表，找不到就用 email）
  let authorName: string | null = null;
  if (authorId) {
    const { data: emp } = await supabase
      .from("employees")
      .select("name")
      .eq("user_id", authorId)
      .eq("brand_id", brand)
      .maybeSingle();
    authorName = emp?.name ?? email ?? null;
  }

  const { data, error } = await supabase
    .from("damage_disputes")
    .insert({
      brand_id: brand,
      pre_inspection_id: input.pre_inspection_id,
      vehicle_id: input.vehicle_id ?? null,
      repair_order_id: input.repair_order_id ?? null,
      dispute_type: input.dispute_type,
      damage_label: input.damage_label.trim(),
      customer_words: words,
      author_id: authorId ?? null,
      author_name: authorName,
      metadata: {},
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "新增異議記錄失敗" };
  }

  revalidatePath(`/parts/aftersales/pre-inspections/${input.pre_inspection_id}`);
  revalidatePath("/parts/aftersales/pre-inspections");

  return { ok: true, data: { id: data.id } };
}

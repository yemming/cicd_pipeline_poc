import "server-only";

/**
 * Domain Helper — damage_disputes（損傷客戶異議記錄）
 *
 * 對應表：damage_disputes（append-only，僅 SELECT + INSERT RLS，無 update/delete policy）
 * 欄位：id, brand_id, pre_inspection_id, repair_order_id, vehicle_id,
 *       dispute_type, damage_label, customer_words, author_id, author_name,
 *       created_at, metadata
 *
 * 業務說明：每筆損傷異議為 7 年不可刪稽核記錄，寫入後設唯讀。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

// runtime 值 / 型別都集中在零相依的 constants 檔（client 端也能安全 import）
import { DISPUTE_TYPE_LABEL, type DamageDispute, type DamageDisputeType } from "./damage-disputes.constants";

export { DISPUTE_TYPE_LABEL };
export type { DamageDispute, DamageDisputeType };

/** 列出某張預檢單的所有損傷異議（已由 RLS 限 brand） */
export async function listDamageDisputesByPiId(
  preInspectionId: string,
): Promise<DamageDispute[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data, error } = await supabase
    .from("damage_disputes")
    .select(
      "id, brand_id, pre_inspection_id, repair_order_id, vehicle_id, dispute_type, damage_label, customer_words, author_id, author_name, created_at",
    )
    .eq("brand_id", brand)
    .eq("pre_inspection_id", preInspectionId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (
    (
      data ?? []
    ) as Array<{
      id: string;
      brand_id: string;
      pre_inspection_id: string | null;
      repair_order_id: string | null;
      vehicle_id: string | null;
      dispute_type: string;
      damage_label: string;
      customer_words: string;
      author_id: string | null;
      author_name: string | null;
      created_at: string;
    }>
  ).map((r) => ({
    id: r.id,
    brandId: r.brand_id,
    preInspectionId: r.pre_inspection_id,
    repairOrderId: r.repair_order_id,
    vehicleId: r.vehicle_id,
    disputeType: r.dispute_type as DamageDisputeType,
    damageLabel: r.damage_label,
    customerWords: r.customer_words,
    authorId: r.author_id,
    authorName: r.author_name,
    createdAt: r.created_at,
  }));
}

"use server";

import { revalidatePath } from "next/cache";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/warranty/cost-recovery";

export async function updateCostRecoveryConfigAction(
  patch: Record<string, unknown>,
): Promise<ActionResult<{ brand_id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = getBrandKey();
  const { error } = await supabase
    .from("parts_warranty_cost_recovery_config")
    .update(patch)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { brand_id: brand } };
}

export async function markClaimPaidAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_warranty_claims")
    .update({
      status: "paid",
      status_label: "已收款",
      expected_pay_date: new Date().toISOString().slice(0, 10),
    })
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: `標記失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

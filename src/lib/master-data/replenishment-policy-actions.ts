"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { ReplenishmentPolicyFieldKey } from "./replenishment-policy-form-types";

import { getActiveScope } from "@/lib/scope/active-scope";

const FREQS = ["weekly_mon", "biweekly", "monthly_1", "manual"] as const;
type Freq = (typeof FREQS)[number];

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Partial<Record<ReplenishmentPolicyFieldKey, string>> };

export type ReplenishmentPolicyInput = {
  warehouse_id?: string | null;
  frequency?: Freq | null;
  horizon_days?: number | null;
  auto_create_pr_for_urgent?: boolean | null;
  include_forecast?: boolean | null;
  notes?: string | null;
  is_active?: boolean | null;
};

function pickFreq(raw: string | null | undefined): Freq {
  const v = String(raw ?? "weekly_mon");
  return (FREQS as readonly string[]).includes(v) ? (v as Freq) : "weekly_mon";
}

function trim(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function intOrDefault(v: number | string | null | undefined, fallback: number): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? fallback), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function buildPayload(input: ReplenishmentPolicyInput) {
  return {
    warehouse_id: trim(input.warehouse_id ?? null),
    frequency: pickFreq(input.frequency),
    horizon_days: intOrDefault(input.horizon_days, 7),
    auto_create_pr_for_urgent: input.auto_create_pr_for_urgent === true,
    include_forecast: input.include_forecast === true,
    notes: trim(input.notes ?? null),
  };
}

function mapDbError(error: { code?: string; message: string }): {
  error: string;
  fieldErrors?: Partial<Record<ReplenishmentPolicyFieldKey, string>>;
} {
  if (error.code === "23505" && error.message.includes("replenishment_policies_brand_wh_uniq")) {
    return {
      error: "此倉庫已有啟用中的補貨計畫",
      fieldErrors: { warehouse_id: "改編輯既有那筆，或停用後再新增" },
    };
  }
  return { error: `儲存失敗：${error.message}` };
}

export async function createReplenishmentPolicyAction(
  input: ReplenishmentPolicyInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.REPLENISHMENT_POLICY_EDIT);
  const payload = buildPayload(input);
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("replenishment_policies")
    .insert({
      brand_id: scope.brand_id,
      subsidiary_id: scope.subsidiary_id,
      ...payload,
    })
    .select("id")
    .single();
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  revalidatePath("/admin/master-data/replenishment-policies");
  return { ok: true, data: { id: data.id } };
}

export async function updateReplenishmentPolicyAction(
  id: string,
  input: ReplenishmentPolicyInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.REPLENISHMENT_POLICY_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };

  const payload = buildPayload(input);
  const supabase = await createClient();
  const { error } = await supabase
    .from("replenishment_policies")
    .update({
      ...payload,
      is_active: input.is_active === true,
    })
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  revalidatePath("/admin/master-data/replenishment-policies");
  revalidatePath(`/admin/master-data/replenishment-policies/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteReplenishmentPolicyAction(
  id: string,
): Promise<ActionResult<null>> {
  await requirePermission(PERMISSIONS.REPLENISHMENT_POLICY_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("replenishment_policies")
    .delete()
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) {
    return { ok: false, error: `刪除失敗：${error.message}` };
  }
  revalidatePath("/admin/master-data/replenishment-policies");
  return { ok: true, data: null };
}

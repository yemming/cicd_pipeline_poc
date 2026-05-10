"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { ReplenishmentPolicyFormState } from "./replenishment-policy-form-types";

import { getActiveScope } from "@/lib/scope/active-scope";
const FREQS = ["weekly_mon", "biweekly", "monthly_1", "manual"] as const;
type Freq = (typeof FREQS)[number];

function pickFreq(raw: FormDataEntryValue | null): Freq {
  const v = String(raw ?? "weekly_mon");
  return (FREQS as readonly string[]).includes(v) ? (v as Freq) : "weekly_mon";
}

function strOrNull(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  return v.length === 0 ? null : v;
}

function intOrDefault(raw: FormDataEntryValue | null, fallback: number): number {
  const v = parseInt(String(raw ?? fallback), 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function pickPayload(fd: FormData) {
  return {
    warehouse_id: strOrNull(fd.get("warehouse_id")),
    frequency: pickFreq(fd.get("frequency")),
    horizon_days: intOrDefault(fd.get("horizon_days"), 7),
    auto_create_pr_for_urgent: fd.get("auto_create_pr_for_urgent") === "on",
    include_forecast: fd.get("include_forecast") === "on",
    notes: strOrNull(fd.get("notes")),
  };
}

function mapDbError(error: { code?: string; message: string }): ReplenishmentPolicyFormState {
  if (error.code === "23505" && error.message.includes("replenishment_policies_brand_wh_uniq")) {
    return {
      error: "此倉庫已有啟用中的補貨計畫",
      fieldErrors: { warehouse_id: "改編輯既有那筆，或停用後再新增" },
    };
  }
  return { error: `儲存失敗：${error.message}` };
}

export async function createReplenishmentPolicyAction(
  _prev: ReplenishmentPolicyFormState,
  fd: FormData,
): Promise<ReplenishmentPolicyFormState> {
  await requirePermission(PERMISSIONS.REPLENISHMENT_POLICY_EDIT);
  const payload = pickPayload(fd);
  const supabase = await createClient();
  const { error } = await supabase.from("replenishment_policies").insert({
    brand_id: (await getActiveScope()).brand_id,
    ...payload,
  });
  if (error) return mapDbError(error);

  revalidatePath("/admin/master-data/replenishment-policies");
  redirect("/admin/master-data/replenishment-policies");
}

export async function updateReplenishmentPolicyAction(
  _prev: ReplenishmentPolicyFormState,
  fd: FormData,
): Promise<ReplenishmentPolicyFormState> {
  await requirePermission(PERMISSIONS.REPLENISHMENT_POLICY_EDIT);
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "缺少 id" };

  const payload = pickPayload(fd);
  const supabase = await createClient();
  const { error } = await supabase
    .from("replenishment_policies")
    .update({
      ...payload,
      is_active: fd.get("is_active") === "on",
    })
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return mapDbError(error);

  revalidatePath("/admin/master-data/replenishment-policies");
  revalidatePath(`/admin/master-data/replenishment-policies/${id}`);
  redirect("/admin/master-data/replenishment-policies");
}

export async function deleteReplenishmentPolicyAction(fd: FormData): Promise<void> {
  await requirePermission(PERMISSIONS.REPLENISHMENT_POLICY_EDIT);
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("replenishment_policies")
    .delete()
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  revalidatePath("/admin/master-data/replenishment-policies");
  redirect("/admin/master-data/replenishment-policies");
}

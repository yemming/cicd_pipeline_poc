"use server";

/**
 * Server Actions — M04L-12 Used Parts Lifecycle Rules
 *
 * Result<T> 風格、不 redirect。客戶端控 banner / refresh。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

const PAGE_PATH = "/parts/warranty/used-parts-flow";

const ALLOWED_STAGES = [
  "removed",
  "staged",
  "under_review",
  "return_to_oem",
  "destroyed",
  "recycled",
] as const;

export type LifecycleStageInput = (typeof ALLOWED_STAGES)[number];

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type LifecycleRuleInput = {
  stage: LifecycleStageInput;
  action_label: string;
  sla_days?: number | null;
  requires_approval?: boolean;
  channel?: string | null;
  target_role?: string | null;
  notes?: string | null;
  is_active?: boolean;
  sort_order?: number;
};

function validateInput(input: LifecycleRuleInput): string | null {
  if (!ALLOWED_STAGES.includes(input.stage))
    return "stage 不是合法的生命週期階段";
  if (!input.action_label || !input.action_label.trim())
    return "處理動作描述不可為空";
  if (input.sla_days != null && input.sla_days < 0)
    return "SLA 天數不可小於 0";
  return null;
}

export async function upsertLifecycleRule(
  input: LifecycleRuleInput & { id?: string },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const err = validateInput(input);
  if (err) return { ok: false, error: err };

  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();

  const payload = {
    brand_id: brand,
    stage: input.stage,
    action_label: input.action_label.trim(),
    sla_days: input.sla_days ?? null,
    requires_approval: input.requires_approval ?? false,
    channel: input.channel?.trim() || null,
    target_role: input.target_role?.trim() || null,
    notes: input.notes?.trim() || null,
    is_active: input.is_active ?? true,
    sort_order: input.sort_order ?? 0,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await supabase
      .from("parts_warranty_used_parts_lifecycle_rules")
      .update(payload)
      .eq("id", input.id)
      .eq("brand_id", brand);
    if (error) return { ok: false, error: `更新失敗：${error.message}` };
    revalidatePath(PAGE_PATH);
    return { ok: true, data: { id: input.id } };
  }

  // create：若 sort_order 沒指定，append 到該 stage 尾端
  if (input.sort_order == null) {
    const { data: maxRow } = await supabase
      .from("parts_warranty_used_parts_lifecycle_rules")
      .select("sort_order")
      .eq("brand_id", brand)
      .eq("stage", input.stage)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    payload.sort_order = ((maxRow?.sort_order as number | undefined) ?? 0) + 10;
  }

  const { data, error } = await supabase
    .from("parts_warranty_used_parts_lifecycle_rules")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, error: `建立失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id as string } };
}

export async function deleteLifecycleRule(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  if (!id) return { ok: false, error: "缺少規則 ID" };
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_warranty_used_parts_lifecycle_rules")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function setLifecycleRuleActive(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  if (!id) return { ok: false, error: "缺少規則 ID" };
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_warranty_used_parts_lifecycle_rules")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `切換失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function reorderLifecycleRules(
  stage: LifecycleStageInput,
  orderedIds: string[],
): Promise<ActionResult<{ stage: LifecycleStageInput; count: number }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  if (!ALLOWED_STAGES.includes(stage))
    return { ok: false, error: "stage 不合法" };
  if (!Array.isArray(orderedIds) || orderedIds.length === 0)
    return { ok: false, error: "沒有要排序的規則" };

  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const now = new Date().toISOString();

  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    const { error } = await supabase
      .from("parts_warranty_used_parts_lifecycle_rules")
      .update({ sort_order: (i + 1) * 10, updated_at: now })
      .eq("id", id)
      .eq("brand_id", brand)
      .eq("stage", stage);
    if (error) return { ok: false, error: `排序失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { stage, count: orderedIds.length } };
}

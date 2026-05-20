"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  type EscalationInput,
  validateEscalationInput,
} from "@/domain/parts-alerts-escalation.constants";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/alerts/escalation";

function buildPayload(input: EscalationInput, brandId: string) {
  return {
    brand_id: brandId,
    alert_type: input.alert_type.trim(),
    alert_label: input.alert_label.trim(),
    alert_priority: input.alert_priority ?? "mid",
    alert_icon: input.alert_icon ?? null,
    trigger_desc: input.trigger_desc ?? null,
    tier: input.tier,
    tier_label: input.tier_label.trim(),
    delay_minutes: input.delay_minutes,
    recipient_label: input.recipient_label ?? null,
    channel_push: input.channel_push ?? true,
    channel_sms: input.channel_sms ?? false,
    channel_email: input.channel_email ?? false,
    is_active: input.is_active ?? true,
    sort_order: input.sort_order ?? 0,
  };
}

export async function createEscalationTierAction(
  input: EscalationInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ALERT_CONFIG);
  const err = validateEscalationInput(input);
  if (err) return { ok: false, error: err };
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("parts_alert_escalation_rules")
    .insert(buildPayload(input, scope.brand_id))
    .select("id")
    .single();
  if (error) return { ok: false, error: `建立失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateEscalationTierAction(
  id: string,
  patch: Partial<EscalationInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ALERT_CONFIG);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const upd: Record<string, unknown> = {};
  if (patch.alert_label !== undefined) upd.alert_label = patch.alert_label.trim();
  if (patch.alert_priority !== undefined) upd.alert_priority = patch.alert_priority;
  if (patch.alert_icon !== undefined) upd.alert_icon = patch.alert_icon;
  if (patch.trigger_desc !== undefined) upd.trigger_desc = patch.trigger_desc;
  if (patch.tier !== undefined) upd.tier = patch.tier;
  if (patch.tier_label !== undefined) upd.tier_label = patch.tier_label.trim();
  if (patch.delay_minutes !== undefined) upd.delay_minutes = patch.delay_minutes;
  if (patch.recipient_label !== undefined) upd.recipient_label = patch.recipient_label;
  if (patch.channel_push !== undefined) upd.channel_push = patch.channel_push;
  if (patch.channel_sms !== undefined) upd.channel_sms = patch.channel_sms;
  if (patch.channel_email !== undefined) upd.channel_email = patch.channel_email;
  if (patch.is_active !== undefined) upd.is_active = patch.is_active;
  if (patch.sort_order !== undefined) upd.sort_order = patch.sort_order;
  upd.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("parts_alert_escalation_rules")
    .update(upd)
    .eq("id", id);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function setEscalationActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ALERT_CONFIG);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_alert_escalation_rules")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: `切換失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function deleteEscalationTierAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ALERT_CONFIG);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_alert_escalation_rules")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

/**
 * 重排 tier — 將同一 alert_type 內的 N 個 rule 按給定順序重新編號 tier 1..N
 * 並更新 sort_order。
 */
export async function reorderEscalationTiersAction(
  alert_type: string,
  orderedIds: string[],
): Promise<ActionResult<{ count: number }>> {
  await requirePermission(PERMISSIONS.ALERT_CONFIG);
  if (!alert_type) return { ok: false, error: "缺少 alert_type" };
  if (orderedIds.length === 0) return { ok: false, error: "排序清單為空" };
  const supabase = await createClient();
  const scope = await getActiveScope();
  // 為了避免 unique constraint 衝突，先把 tier 全部臨時設大數
  const now = new Date().toISOString();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("parts_alert_escalation_rules")
      .update({ tier: 1000 + i, updated_at: now })
      .eq("brand_id", scope.brand_id)
      .eq("alert_type", alert_type)
      .eq("id", orderedIds[i]);
    if (error) return { ok: false, error: `重排失敗（暫存）：${error.message}` };
  }
  // 再寫入正確的 tier
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("parts_alert_escalation_rules")
      .update({ tier: i + 1, sort_order: (i + 1) * 10, updated_at: now })
      .eq("brand_id", scope.brand_id)
      .eq("alert_type", alert_type)
      .eq("id", orderedIds[i]);
    if (error) return { ok: false, error: `重排失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { count: orderedIds.length } };
}

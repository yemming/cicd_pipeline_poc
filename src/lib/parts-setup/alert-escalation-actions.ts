"use server";

import { revalidatePath } from "next/cache";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/alerts/escalation";

export type EscalationPatch = {
  delay_minutes?: number;
  recipient_label?: string | null;
  channel_push?: boolean;
  channel_sms?: boolean;
  channel_email?: boolean;
};

export async function updateEscalationRuleAction(
  id: string,
  patch: EscalationPatch,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ALERT_CONFIG);
  if (!id) return { ok: false, error: "缺少規則 id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_alert_escalation_rules")
    .update({
      ...(patch.delay_minutes !== undefined && {
        delay_minutes: Math.max(0, Math.floor(patch.delay_minutes)),
      }),
      ...(patch.recipient_label !== undefined && {
        recipient_label: patch.recipient_label?.trim() || null,
      }),
      ...(patch.channel_push !== undefined && { channel_push: patch.channel_push }),
      ...(patch.channel_sms !== undefined && { channel_sms: patch.channel_sms }),
      ...(patch.channel_email !== undefined && { channel_email: patch.channel_email }),
    })
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: `儲存階層失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export type ReceiverInput = {
  display_name: string;
  role_label?: string;
  avatar_color?: string;
  default_push?: boolean;
  default_sms?: boolean;
  default_email?: boolean;
};

export async function createReceiverAction(
  input: ReceiverInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ALERT_CONFIG);
  const name = input.display_name?.trim();
  if (!name) return { ok: false, error: "姓名必填" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_alert_receivers")
    .insert({
      brand_id: getBrandKey(),
      display_name: name,
      role_label: input.role_label?.trim() || null,
      avatar_color: input.avatar_color || "navy",
      default_push: input.default_push ?? true,
      default_sms: input.default_sms ?? false,
      default_email: input.default_email ?? false,
      sort_order: 99,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "此人員已存在" };
    return { ok: false, error: `新增接收人失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateReceiverAction(
  id: string,
  patch: Partial<ReceiverInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ALERT_CONFIG);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const upd: Record<string, unknown> = {};
  if (patch.display_name !== undefined) upd.display_name = patch.display_name.trim();
  if (patch.role_label !== undefined) upd.role_label = patch.role_label?.trim() || null;
  if (patch.avatar_color !== undefined) upd.avatar_color = patch.avatar_color;
  if (patch.default_push !== undefined) upd.default_push = patch.default_push;
  if (patch.default_sms !== undefined) upd.default_sms = patch.default_sms;
  if (patch.default_email !== undefined) upd.default_email = patch.default_email;
  const { error } = await supabase
    .from("parts_alert_receivers")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function deleteReceiverAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ALERT_CONFIG);
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_alert_receivers")
    .delete()
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

"use server";

/**
 * Server Actions — CRM06A/B 推播範本 CRUD
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  PushKind,
  PushChannel,
} from "@/domain/sales-push-templates.constants";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type PushTemplateInput = {
  kind: PushKind;
  category: string;
  name: string;
  channel: PushChannel;
  icon?: string | null;
  body: string;
  buttons?: Array<{ label: string; url: string }>;
  is_active?: boolean;
};

function revalidateAll(kind: PushKind, id?: string) {
  revalidatePath(`/crm/sales/push-notifications`);
  revalidatePath(`/crm/aftersales/push-notifications`);
  if (id) {
    revalidatePath(`/crm/${kind === "sales" ? "sales" : "aftersales"}/push-notifications/${id}`);
  }
}

function trim(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function mapDbError(e: { code?: string; message: string }): string {
  if (e.code === "23514") {
    if (e.message.includes("push_message_templates_kind_check"))
      return "kind 不合法（只允許 sales / aftersales）";
    if (e.message.includes("push_message_templates_channel_check"))
      return "通道不合法（line / sms / both）";
  }
  return `儲存失敗：${e.message}`;
}

function validate(input: PushTemplateInput): string | null {
  if (!trim(input.name)) return "範本名稱必填";
  if (!trim(input.category)) return "分類必填";
  if (!trim(input.body)) return "訊息內容必填";
  if (input.body.length > 2000) return "訊息內容過長（最多 2000 字）";
  return null;
}

export async function createPushTemplateAction(
  input: PushTemplateInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("push_message_templates")
    .insert({
      brand_id: brand,
      kind: input.kind,
      category: trim(input.category),
      name: trim(input.name),
      channel: input.channel,
      icon: input.icon ?? null,
      body: trim(input.body),
      buttons: input.buttons ?? [],
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: mapDbError(error ?? { message: "未知錯誤" }) };
  }
  revalidateAll(input.kind, data.id as string);
  return { ok: true, data: { id: data.id as string } };
}

export async function updatePushTemplateAction(
  id: string,
  input: Partial<PushTemplateInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = trim(input.name);
  if (input.category !== undefined) patch.category = trim(input.category);
  if (input.channel !== undefined) patch.channel = input.channel;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.body !== undefined) patch.body = trim(input.body);
  if (input.buttons !== undefined) patch.buttons = input.buttons;
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const { data, error } = await supabase
    .from("push_message_templates")
    .update(patch)
    .eq("brand_id", brand)
    .eq("id", id)
    .select("id, kind")
    .single();

  if (error || !data) {
    return { ok: false, error: mapDbError(error ?? { message: "找不到資料" }) };
  }
  revalidateAll(data.kind as PushKind, id);
  return { ok: true, data: { id } };
}

export async function deletePushTemplateAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();

  // 撈 kind 用於 revalidate
  const { data: existing } = await supabase
    .from("push_message_templates")
    .select("kind")
    .eq("brand_id", brand)
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("push_message_templates")
    .delete()
    .eq("brand_id", brand)
    .eq("id", id);

  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidateAll((existing?.kind as PushKind) ?? "sales");
  return { ok: true, data: { id } };
}

export async function togglePushTemplateActiveAction(
  id: string,
  is_active: boolean,
): Promise<ActionResult<{ id: string }>> {
  return updatePushTemplateAction(id, { is_active });
}

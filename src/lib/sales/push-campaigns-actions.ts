"use server";

/**
 * Server Actions — CRM06A/B 推播任務 CRUD + 試算客群
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { notifications } from "@/lib/notifications";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  PushChannel,
  PushKind,
} from "@/domain/sales-push-templates.constants";
import type {
  CampaignExtraConditions,
  CampaignStatus,
} from "@/domain/sales-push-campaigns.constants";
import { previewCampaignAudience } from "@/domain/sales-push-campaigns";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CampaignInput = {
  kind: PushKind;
  name: string;
  template_id?: string | null;
  channel: PushChannel;
  message_body: string;
  buttons?: Array<{ label: string; url: string }>;
  target_habc: string[];
  /** pull 模式：人工指定的 lead id 清單（覆蓋 HABC 條件篩選） */
  target_lead_ids?: string[] | null;
  extra_conditions: CampaignExtraConditions;
  scheduled_at?: string | null; // ISO；null = 立即
  audience_count?: number;
};

function revalidateAll(kind: PushKind) {
  revalidatePath(`/crm/sales/push-notifications`);
  revalidatePath(`/crm/aftersales/push-notifications`);
  void kind;
}

function trim(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function validate(input: CampaignInput): string | null {
  if (!trim(input.name)) return "任務名稱必填";
  if (!trim(input.message_body)) return "訊息內容必填";
  // pull 模式（target_lead_ids 有值）不需要 HABC；push 模式才強制選 HABC
  const isPullMode = input.target_lead_ids && input.target_lead_ids.length > 0;
  if (!isPullMode && (!input.target_habc || input.target_habc.length === 0))
    return "至少選一個 HABC 客群";
  return null;
}

function mapDbError(e: { code?: string; message: string }): string {
  if (e.code === "23514") {
    if (e.message.includes("push_campaigns_status_check"))
      return "狀態不合法";
    if (e.message.includes("push_campaigns_channel_check"))
      return "通道不合法";
  }
  return `儲存失敗：${e.message}`;
}

export async function createCampaignAction(
  input: CampaignInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();

  // 重新試算 audience_count（避免 stale）
  const audience = await previewCampaignAudience({
    kind: input.kind,
    target_habc: input.target_habc,
    extra_conditions: input.extra_conditions,
    target_lead_ids: input.target_lead_ids,
  });

  const status: CampaignStatus = input.scheduled_at ? "scheduled" : "draft";

  const { data, error } = await supabase
    .from("push_campaigns")
    .insert({
      brand_id: brand,
      kind: input.kind,
      name: trim(input.name),
      template_id: input.template_id ?? null,
      channel: input.channel,
      message_body: trim(input.message_body),
      buttons: input.buttons ?? [],
      target_habc: input.target_habc,
      target_lead_ids: input.target_lead_ids ?? null,
      extra_conditions: input.extra_conditions ?? {},
      audience_count: audience,
      scheduled_at: input.scheduled_at ?? null,
      status,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: mapDbError(error ?? { message: "未知錯誤" }) };
  }
  revalidateAll(input.kind);
  return { ok: true, data: { id: data.id as string } };
}

export async function cancelCampaignAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("push_campaigns")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("brand_id", brand)
    .eq("id", id)
    .in("status", ["draft", "scheduled"])
    .select("id, kind")
    .single();

  if (error || !data) {
    return { ok: false, error: "只允許取消 草稿 / 已排程 任務" };
  }
  revalidateAll(data.kind as PushKind);
  return { ok: true, data: { id } };
}

/**
 * 發送推播任務 — 把 draft/scheduled 任務標為已完成，並經 Notification Hub 推一張摘要卡到 LINE。
 *
 * Phase 1（C-25）：示範鏈路。客戶端 LINE 綁定（customers 無 LINE userId）屬另案，
 * 故本輪推「推播摘要」到既有通知群組，證明「CRM 按發送 → Hub → 真 LINE」整條打通；
 * sent_count 暫記為 audience_count（代表本任務鎖定的受眾規模）。
 */
export async function sendCampaignAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();

  const { data: campaign, error: loadErr } = await supabase
    .from("push_campaigns")
    .select(
      "id, kind, name, channel, message_body, target_habc, audience_count, status",
    )
    .eq("brand_id", brand)
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !campaign) return { ok: false, error: "找不到任務" };
  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    return { ok: false, error: "只允許發送 草稿 / 已排程 任務" };
  }

  const { data, error } = await supabase
    .from("push_campaigns")
    .update({
      status: "completed",
      sent_count: campaign.audience_count ?? 0,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("brand_id", brand)
    .eq("id", id)
    .in("status", ["draft", "scheduled"])
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: mapDbError(error ?? { message: "未知錯誤" }) };
  }

  // 非阻塞推 LINE（不擋使用者；失敗不影響任務已標完成）
  const preview = trim(campaign.message_body).slice(0, 60);
  const kind = campaign.kind as PushKind;
  const _campaignAppUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://dealeros.zeabur.app").replace(/\/+$/, "");
  after(async () => {
    await notifications.dispatch({
      code: "crm_push.sent",
      dealerId: brand,
      payload: {
        kind,
        campaignName: trim(campaign.name),
        channel: campaign.channel,
        audienceCount: campaign.audience_count ?? 0,
        targetHabc: (campaign.target_habc ?? []).join("、"),
        messagePreview: preview,
        brand,
        url: `${_campaignAppUrl}/crm/${kind === "aftersales" ? "aftersales" : "sales"}/push-notifications`,
      },
    });
  });

  revalidateAll(kind);
  return { ok: true, data: { id } };
}

export async function deleteCampaignAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("push_campaigns")
    .select("kind, status")
    .eq("brand_id", brand)
    .eq("id", id)
    .maybeSingle();

  if (!existing) return { ok: false, error: "找不到任務" };
  if (existing.status === "sending") {
    return { ok: false, error: "發送中的任務不可刪除，請先取消" };
  }

  const { error } = await supabase
    .from("push_campaigns")
    .delete()
    .eq("brand_id", brand)
    .eq("id", id);

  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidateAll(existing.kind as PushKind);
  return { ok: true, data: { id } };
}

export async function previewAudienceAction(input: {
  kind: PushKind;
  target_habc: string[];
  extra_conditions: CampaignExtraConditions;
  target_lead_ids?: string[] | null;
}): Promise<ActionResult<{ count: number }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_VIEW);
  const count = await previewCampaignAudience(input);
  return { ok: true, data: { count } };
}

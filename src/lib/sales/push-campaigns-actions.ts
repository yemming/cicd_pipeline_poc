"use server";

/**
 * Server Actions — CRM06A/B 推播任務 CRUD + 試算客群
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { notifications, getChannel } from "@/lib/notifications";
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

/** 發送結果分流明細 */
type SendBreakdown = {
  lineSent: number;
  lineFailed: number;
  emailPending: number;
  phoneOnly: number;
  excludedInvalid: number;
};

/**
 * 發送推播任務（Russell RS04 裁示③ — 真 fan-out 分流）
 *
 * pull 模式（target_lead_ids 有值）：
 *   - 撈 leads、排除 has_valid_contact=false（無有效聯絡方式的無效接待）
 *   - 依 LINE > Email > 電訪 優先序逐 lead 分流：
 *       有 line_user_id → 即時推 LINE（graceful：失敗只計數，不中斷整批）
 *       否則有 email   → 計入 emailPending（SMTP 尚未接，不推）
 *       否則有 phone   → 計入 phoneOnly（電訪）
 *   - sent_count = lineSent（實際推出數）、fanout_breakdown 存 metadata
 *
 * push 模式（無 target_lead_ids）：
 *   - 維持原「摘要卡」路徑，sent_count = audience_count，分流計數全為 0。
 *
 * 兩種模式都保留「非阻塞推管理者摘要卡到門店群組（crm_push.sent）」。
 */
export async function sendCampaignAction(
  id: string,
): Promise<ActionResult<{ id: string } & SendBreakdown>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();

  // ── 1. 載入 campaign（含 target_lead_ids）────────────────────
  const { data: campaign, error: loadErr } = await supabase
    .from("push_campaigns")
    .select(
      "id, kind, name, channel, message_body, target_habc, target_lead_ids, audience_count, status",
    )
    .eq("brand_id", brand)
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !campaign) return { ok: false, error: "找不到任務" };
  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    return { ok: false, error: "只允許發送 草稿 / 已排程 任務" };
  }

  const kind = campaign.kind as PushKind;
  const isPullMode =
    Array.isArray(campaign.target_lead_ids) &&
    (campaign.target_lead_ids as string[]).length > 0;

  // ── 2. Fan-out（pull 模式）────────────────────────────────────
  let lineSent = 0;
  let lineFailed = 0;
  let emailPending = 0;
  let phoneOnly = 0;
  let excludedInvalid = 0;

  if (isPullMode) {
    const table =
      kind === "aftersales" ? "aftersales_dormant_leads" : "sales_dormant_leads";
    const leadIds = campaign.target_lead_ids as string[];

    const { data: leads } = await supabase
      .from(table)
      .select("id, name, phone, email, line_user_id, has_valid_contact")
      .eq("brand_id", brand)
      .in("id", leadIds);

    const allLeads = (leads ?? []) as Array<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      line_user_id: string | null;
      has_valid_contact: boolean;
    }>;

    // 排除無有效聯絡方式的無效接待（Russell ②）
    const validLeads = allLeads.filter((l) => l.has_valid_contact);
    excludedInvalid = allLeads.length - validLeads.length;

    // 逐 lead 依管道分流（優先序 LINE > Email > 電訪）
    const lineChannel = getChannel("line");
    for (const lead of validLeads) {
      if (lead.line_user_id) {
        // 有 LINE userId → 推 LINE（send 內建 3 次退避，不 throw）
        try {
          const res = await lineChannel.send(
            { ref: lead.line_user_id },
            { type: "text", text: campaign.message_body as string },
          );
          if (res.ok) {
            lineSent++;
          } else {
            lineFailed++;
            console.warn(
              `[sendCampaignAction] LINE 推播失敗 lead=${lead.id}: ${res.error?.message ?? "unknown"}`,
            );
          }
        } catch (e) {
          // 防禦性 catch（理論上 send 不 throw，但保險起見）
          lineFailed++;
          console.warn(`[sendCampaignAction] LINE 推播例外 lead=${lead.id}:`, e);
        }
      } else if (lead.email) {
        // 有 Email → 待 Email 通道（本專案尚未接 SMTP，只計數）
        emailPending++;
      } else if (lead.phone) {
        // 只有手機 → 只能電訪
        phoneOnly++;
      }
      // 三者皆無的 lead 已被 has_valid_contact=false 擋在 validLeads 外
    }
  }

  // ── 3. 更新 campaign────────────────────────────────────────────
  // pull 模式：sent_count = 實際推出 LINE 筆數；push 模式：沿用 audience_count
  const sentCount = isPullMode ? lineSent : (campaign.audience_count ?? 0);
  const fanoutBreakdown: SendBreakdown = {
    lineSent,
    lineFailed,
    emailPending,
    phoneOnly,
    excludedInvalid,
  };

  const { data: updated, error: updateErr } = await supabase
    .from("push_campaigns")
    .update({
      status: "completed",
      sent_count: sentCount,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // 分流明細存 metadata（push_campaigns.metadata jsonb 欄位存在）
      metadata: { fanout_breakdown: fanoutBreakdown },
    })
    .eq("brand_id", brand)
    .eq("id", id)
    .in("status", ["draft", "scheduled"])
    .select("id")
    .single();

  if (updateErr || !updated) {
    return { ok: false, error: mapDbError(updateErr ?? { message: "未知錯誤" }) };
  }

  // ── 4. 非阻塞推管理者摘要卡到門店群組（不擋使用者）────────────
  const preview = trim(campaign.message_body as string).slice(0, 60);
  const _campaignAppUrl = (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://dealeros.zeabur.app"
  ).replace(/\/+$/, "");
  after(async () => {
    await notifications.dispatch({
      code: "crm_push.sent",
      dealerId: brand,
      payload: {
        kind,
        campaignName: trim(campaign.name as string),
        channel: campaign.channel,
        audienceCount: sentCount,
        targetHabc: ((campaign.target_habc as string[]) ?? []).join("、"),
        messagePreview: preview,
        brand,
        url: `${_campaignAppUrl}/crm/${
          kind === "aftersales" ? "aftersales" : "sales"
        }/push-notifications`,
      },
    });
  });

  revalidateAll(kind);
  return {
    ok: true,
    data: { id, ...fanoutBreakdown },
  };
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

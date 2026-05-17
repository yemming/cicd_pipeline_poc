/**
 * Domain Helper — CRM06A/B 推播任務 / 發送記錄與成效
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

export type {
  CampaignStatus,
  CampaignRow,
  CampaignExtraConditions,
  HabcLevel,
  PushBoardKpi,
} from "@/domain/sales-push-campaigns.constants";
import type {
  CampaignRow,
  CampaignStatus,
  CampaignExtraConditions,
  PushBoardKpi,
  PushChannel,
} from "@/domain/sales-push-campaigns.constants";
import type { PushKind } from "@/domain/sales-push-templates.constants";

type CampaignDbRow = {
  id: string;
  brand_id: string;
  kind: string;
  name: string;
  template_id: string | null;
  channel: string;
  message_body: string;
  buttons: unknown;
  target_habc: string[] | null;
  extra_conditions: unknown;
  audience_count: number;
  scheduled_at: string | null;
  status: string;
  sent_count: number;
  read_count: number;
  click_count: number;
  convert_count: number;
  created_at: string;
  sent_at: string | null;
  push_message_templates: { name: string } | null;
};

function mapCampaign(r: CampaignDbRow): CampaignRow {
  return {
    id: r.id,
    brand_id: r.brand_id,
    kind: r.kind as "sales" | "aftersales",
    name: r.name,
    template_id: r.template_id,
    template_name: r.push_message_templates?.name ?? null,
    channel: r.channel as PushChannel,
    message_body: r.message_body ?? "",
    buttons: Array.isArray(r.buttons)
      ? (r.buttons as Array<{ label: string; url: string }>)
      : [],
    target_habc: Array.isArray(r.target_habc) ? r.target_habc : [],
    extra_conditions: (r.extra_conditions as CampaignExtraConditions) ?? {},
    audience_count: Number(r.audience_count ?? 0),
    scheduled_at: r.scheduled_at,
    status: r.status as CampaignStatus,
    sent_count: Number(r.sent_count ?? 0),
    read_count: Number(r.read_count ?? 0),
    click_count: Number(r.click_count ?? 0),
    convert_count: Number(r.convert_count ?? 0),
    created_at: r.created_at,
    sent_at: r.sent_at,
  };
}

export async function listPushCampaigns(kind: PushKind): Promise<CampaignRow[]> {
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("push_campaigns")
    .select(
      `id, brand_id, kind, name, template_id, channel, message_body, buttons,
       target_habc, extra_conditions, audience_count, scheduled_at, status,
       sent_count, read_count, click_count, convert_count, created_at, sent_at,
       push_message_templates ( name )`,
    )
    .eq("brand_id", brand)
    .eq("kind", kind)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[listPushCampaigns] error", error);
    return [];
  }
  return ((data ?? []) as unknown as CampaignDbRow[]).map(mapCampaign);
}

export async function getPushBoardKpi(kind: PushKind): Promise<PushBoardKpi> {
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("push_message_templates")
    .select("channel, open_rate, is_active")
    .eq("brand_id", brand)
    .eq("kind", kind);

  const tList = templates ?? [];
  const template_by_channel: Record<PushChannel, number> = {
    line: 0,
    sms: 0,
    email: 0,
    both: 0,
  };
  let rateSum = 0;
  let rateCnt = 0;
  for (const t of tList) {
    const ch = (t.channel as PushChannel) ?? "line";
    template_by_channel[ch] = (template_by_channel[ch] ?? 0) + 1;
    if (t.open_rate !== null && t.open_rate !== undefined) {
      rateSum += Number(t.open_rate);
      rateCnt += 1;
    }
  }

  // 本月 campaign（completed / sending）
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: campaigns } = await supabase
    .from("push_campaigns")
    .select("sent_count, read_count, convert_count, status, sent_at")
    .eq("brand_id", brand)
    .eq("kind", kind)
    .in("status", ["completed", "sending"])
    .gte("sent_at", monthStart.toISOString());

  let monthly_sent = 0;
  let monthly_read = 0;
  let monthly_convert = 0;
  let monthly_campaign_count = 0;
  for (const c of campaigns ?? []) {
    monthly_sent += Number(c.sent_count ?? 0);
    monthly_read += Number(c.read_count ?? 0);
    monthly_convert += Number(c.convert_count ?? 0);
    monthly_campaign_count += 1;
  }

  // ── CRM06B：推播後 14 天內預約進廠率（只對 aftersales kind 算）─────────────
  let visit_within_14d_rate = 0;
  let visit_within_14d_sample = 0;
  if (kind === "aftersales") {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentCamps } = await supabase
      .from("push_campaigns")
      .select("sent_count, convert_count, sent_at")
      .eq("brand_id", brand)
      .eq("kind", "aftersales")
      .eq("status", "completed")
      .gte("sent_at", thirtyDaysAgo);
    const samples = recentCamps ?? [];
    const totalSent = samples.reduce((s, c) => s + Number(c.sent_count ?? 0), 0);
    // convert_count 已經是「該推播後成功進廠 / 預約 / 成交」的累計 — demo 視角當作 14d 進廠數
    const totalVisits = samples.reduce((s, c) => s + Number(c.convert_count ?? 0), 0);
    visit_within_14d_sample = totalSent;
    visit_within_14d_rate =
      totalSent > 0 ? Math.round((totalVisits / totalSent) * 1000) / 10 : 0;
  }

  return {
    template_count: tList.length,
    template_by_channel,
    avg_open_rate: rateCnt > 0 ? Math.round((rateSum / rateCnt) * 10) / 10 : 0,
    monthly_sent,
    monthly_read,
    monthly_open_rate:
      monthly_sent > 0 ? Math.round((monthly_read / monthly_sent) * 1000) / 10 : 0,
    monthly_campaign_count,
    monthly_convert,
    visit_within_14d_rate,
    visit_within_14d_sample,
  };
}

/**
 * 客群試算：給 Step 2 顯示「符合 N 位客戶」
 * v1 簡化：估算（HABC 假定總客戶 200 平均分布 + extra condition scaling）
 * 真正用 customers 表的客群查詢屆時再接，先給數字穩定的近似值好 demo。
 */
export async function previewCampaignAudience(input: {
  kind: PushKind;
  target_habc: string[];
  extra_conditions: CampaignExtraConditions;
}): Promise<number> {
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();

  // 撈該 brand 全部 customer 數作 base
  const { count: baseCount } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brand);
  let base = baseCount ?? 0;
  if (base === 0) base = 200; // demo fallback

  // HABC 篩選：每級約 25%
  const habcRatio = (input.target_habc?.length ?? 0) / 4;
  let n = Math.round(base * (habcRatio > 0 ? habcRatio : 1));

  // 附加條件粗略 scale
  const ec = input.extra_conditions ?? {};
  if (ec.first_purchase === "yes") n = Math.round(n * 0.4);
  if (ec.first_purchase === "no") n = Math.round(n * 0.6);
  if (ec.gender === "M") n = Math.round(n * 0.85);
  if (ec.gender === "F") n = Math.round(n * 0.15);
  if (ec.cities && ec.cities.length > 0) n = Math.round(n * 0.5);
  if (ec.last_contact_days_gt) n = Math.round(n * 0.7);
  if (ec.birth_month) n = Math.round(n / 12);
  if (ec.delivery_months_ago) n = Math.round(n * 0.2);

  return Math.max(0, n);
}

/**
 * Domain Helper — 推播通知設定（銷售 + 售後共用）
 *
 * 業務人員 self-service：訂閱哪些事件、走 LINE 或 Google Chat、發到哪個 target。
 * 底層 reuse `notification_subscriptions` + `notification_targets` + `notification_templates`
 * （見 src/lib/notifications/README.md）；本頁的 row 都帶 module='sales' / 'aftersales'
 * 區隔全域 admin 訂閱。
 *
 * 寫入走 src/lib/sales/sales-notifications-actions.ts。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  eventCodesForModule,
  eventsForModule,
  type SalesNotificationChannelCode,
  type SalesNotificationEventCode,
  type SalesNotificationEventMeta,
  type SalesNotificationModule,
} from "@/domain/sales-notifications.constants";

export type {
  SalesNotificationEventCode,
  SalesNotificationChannelCode,
  SalesNotificationEventMeta,
  SalesNotificationModule,
} from "@/domain/sales-notifications.constants";

export type SalesNotificationSubscriptionRow = {
  id: string;
  event_code: string;
  template_code: string | null;
  is_active: boolean;
  filter_rules: Record<string, unknown>;
  brand_id: string;
  module: string;
  // joined target
  target_id: string;
  target_display_name: string;
  target_ref: string;
  target_type: string;
  channel_code: SalesNotificationChannelCode;
};

export type SalesNotificationTargetRow = {
  id: string;
  channel_code: SalesNotificationChannelCode;
  channel_display: string;
  target_type: string;
  target_ref: string;
  display_name: string;
  is_active: boolean;
};

export type SalesNotificationTemplateRow = {
  code: string;
  event_code: string;
  channel_code: SalesNotificationChannelCode;
  description: string | null;
};

export type SalesNotificationEventGroup = {
  meta: SalesNotificationEventMeta;
  subscriptions: SalesNotificationSubscriptionRow[];
};

export type SalesNotificationsBoardData = {
  events: SalesNotificationEventGroup[];
  targets: SalesNotificationTargetRow[];
  templates: SalesNotificationTemplateRow[];
};

export async function getSalesNotificationsBoardData(
  module: SalesNotificationModule = "sales",
): Promise<SalesNotificationsBoardData> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const eventMetas = eventsForModule(module);
  const eventCodes: SalesNotificationEventCode[] = eventCodesForModule(module);

  // 1) channels（建 channel_id → channel_code map，給 target 補上 code）
  const { data: channelsRaw, error: chErr } = await supabase
    .from("notification_channels")
    .select("id, code, display_name");
  if (chErr) throw chErr;
  const channelMap = new Map<string, { code: SalesNotificationChannelCode; display: string }>(
    (channelsRaw ?? []).map((c) => [
      c.id as string,
      {
        code: c.code as SalesNotificationChannelCode,
        display: c.display_name as string,
      },
    ]),
  );

  // 2) targets（brand-scoped；RLS 自動套）
  const { data: targetsRaw, error: tErr } = await supabase
    .from("notification_targets")
    .select(
      "id, channel_id, target_type, target_ref, display_name, is_active",
    )
    .eq("brand_id", brand)
    .order("display_name", { ascending: true });
  if (tErr) throw tErr;

  const targets: SalesNotificationTargetRow[] = (targetsRaw ?? []).map((t) => {
    const ch = channelMap.get(t.channel_id as string);
    return {
      id: t.id as string,
      channel_code: ch?.code ?? "line",
      channel_display: ch?.display ?? "—",
      target_type: t.target_type as string,
      target_ref: t.target_ref as string,
      display_name: t.display_name as string,
      is_active: t.is_active as boolean,
    };
  });
  const targetMap = new Map<string, SalesNotificationTargetRow>(
    targets.map((t) => [t.id, t]),
  );

  // 3) subscriptions（只撈指定 module + 對應事件 codes，brand 由 RLS scope）
  const { data: subsRaw, error: sErr } = await supabase
    .from("notification_subscriptions")
    .select(
      "id, event_code, target_id, template_code, filter_rules, is_active, brand_id, module",
    )
    .eq("module", module)
    .in("event_code", eventCodes)
    .order("event_code", { ascending: true });
  if (sErr) throw sErr;

  const subscriptions: SalesNotificationSubscriptionRow[] = (subsRaw ?? [])
    .map((s) => {
      const tgt = targetMap.get(s.target_id as string);
      if (!tgt) return null;
      return {
        id: s.id as string,
        event_code: s.event_code as string,
        template_code: (s.template_code as string | null) ?? null,
        is_active: s.is_active as boolean,
        filter_rules: (s.filter_rules as Record<string, unknown>) ?? {},
        brand_id: s.brand_id as string,
        module: s.module as string,
        target_id: tgt.id,
        target_display_name: tgt.display_name,
        target_ref: tgt.target_ref,
        target_type: tgt.target_type,
        channel_code: tgt.channel_code,
      };
    })
    .filter((x): x is SalesNotificationSubscriptionRow => x !== null);

  // 4) templates（只回對應事件相關的）
  const { data: tplsRaw, error: tplErr } = await supabase
    .from("notification_templates")
    .select("code, event_code, channel_code, description, is_active")
    .in("event_code", eventCodes);
  if (tplErr) throw tplErr;
  const templates: SalesNotificationTemplateRow[] = (tplsRaw ?? [])
    .filter((t) => t.is_active !== false)
    .map((t) => ({
      code: t.code as string,
      event_code: t.event_code as string,
      channel_code: t.channel_code as SalesNotificationChannelCode,
      description: (t.description as string | null) ?? null,
    }));

  // 5) 依事件 meta 順序分組
  const events: SalesNotificationEventGroup[] = eventMetas.map((meta) => ({
    meta,
    subscriptions: subscriptions.filter((s) => s.event_code === meta.code),
  }));

  return { events, targets, templates };
}

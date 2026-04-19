import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChannelCode,
  EventCode,
  NotificationSubscriptionRow,
  NotificationTargetRow,
} from "../types";

const TABLE = "notification_subscriptions";

/** 解析後的訂閱（已 join target + channel，供 dispatch 使用）*/
export interface ResolvedSubscription {
  subscription: NotificationSubscriptionRow;
  target: NotificationTargetRow;
  channelCode: ChannelCode;
}

/**
 * 給定事件碼 → 取出所有 active 訂閱（含 target + channel 資訊）。
 * Phase 3 dispatch 的 input。
 */
export async function listActiveByEvent(
  supabase: SupabaseClient,
  eventCode: EventCode,
): Promise<ResolvedSubscription[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      `
      *,
      target:notification_targets!inner(
        *,
        channel:notification_channels!inner(code, is_active)
      )
    `,
    )
    .eq("event_code", eventCode)
    .eq("is_active", true)
    .eq("target.is_active", true)
    .eq("target.channel.is_active", true);

  if (error) throw new Error(`listActiveByEvent 失敗：${error.message}`);

  return (data ?? []).map((row) => {
    const sub = row as NotificationSubscriptionRow & {
      target: NotificationTargetRow & { channel: { code: ChannelCode } };
    };
    return {
      subscription: {
        id: sub.id,
        event_code: sub.event_code,
        target_id: sub.target_id,
        template_code: sub.template_code,
        filter_rules: sub.filter_rules,
        is_active: sub.is_active,
        created_at: sub.created_at,
        updated_at: sub.updated_at,
      },
      target: {
        id: sub.target.id,
        channel_id: sub.target.channel_id,
        target_type: sub.target.target_type,
        target_ref: sub.target.target_ref,
        display_name: sub.target.display_name,
        metadata: sub.target.metadata,
        is_active: sub.target.is_active,
        created_at: sub.target.created_at,
        updated_at: sub.target.updated_at,
      },
      channelCode: sub.target.channel.code,
    };
  });
}

export async function listAllSubscriptions(
  supabase: SupabaseClient,
): Promise<NotificationSubscriptionRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listAllSubscriptions 失敗：${error.message}`);
  return (data ?? []) as NotificationSubscriptionRow[];
}

export interface CreateSubscriptionInput {
  event_code: EventCode;
  target_id: string;
  template_code?: string | null;
  filter_rules?: Record<string, unknown>;
  is_active?: boolean;
}

export async function createSubscription(
  supabase: SupabaseClient,
  input: CreateSubscriptionInput,
): Promise<NotificationSubscriptionRow> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      event_code: input.event_code,
      target_id: input.target_id,
      template_code: input.template_code ?? null,
      filter_rules: input.filter_rules ?? {},
      is_active: input.is_active ?? true,
    })
    .select("*")
    .single();
  if (error || !data)
    throw new Error(`createSubscription 失敗：${error?.message ?? "unknown"}`);
  return data as NotificationSubscriptionRow;
}

export async function updateSubscription(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<CreateSubscriptionInput>,
): Promise<NotificationSubscriptionRow> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data)
    throw new Error(`updateSubscription 失敗：${error?.message ?? "unknown"}`);
  return data as NotificationSubscriptionRow;
}

export async function deleteSubscription(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(`deleteSubscription 失敗：${error.message}`);
}

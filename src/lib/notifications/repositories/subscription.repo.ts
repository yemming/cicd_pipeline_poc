import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveScope } from "@/lib/scope/active-scope";
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
 * 給定事件碼 + 品牌 → 取出所有 active 的「target_id 導向（群組/webhook）」訂閱
 * （含 target + channel 資訊）。target_role 導向的角色路由訂閱走
 * listActiveRoleSubscriptionsByEvent，不會出現在這裡（target_id 為 null，
 * inner join 天然濾掉）。
 *
 * brandId 必須由呼叫端明確傳入（見 resolver.ts 的 event.dealerId ?? activeScope
 * 邏輯）——過去這裡直接呼叫 getActiveScope()，但 cron / webhook 觸發的 dispatch
 * 沒有使用者 session cookie，會悄悄 fallback 到 env 預設品牌，導致背景任務永遠
 * 用錯品牌的訂閱名單（好幾個 cron 都中招，已一併修正呼叫端）。
 */
export async function listActiveByEvent(
  supabase: SupabaseClient,
  eventCode: EventCode,
  brandId: string,
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
    .eq("brand_id", brandId)
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
        target_role: sub.target_role,
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

/**
 * 給定事件碼 + 品牌 → 取出所有 active 的「target_role 導向（角色路由）」訂閱。
 * 不 join notification_targets（角色路由的收件人是動態算出來的一批員工個人 LINE，
 * 不是單一固定 target），實際收件人由 resolver.ts 呼叫
 * @/domain/line-binding 的 listActiveEmployeesByRole 解析。
 */
export async function listActiveRoleSubscriptionsByEvent(
  supabase: SupabaseClient,
  eventCode: EventCode,
  brandId: string,
): Promise<NotificationSubscriptionRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("brand_id", brandId)
    .eq("event_code", eventCode)
    .eq("is_active", true)
    .not("target_role", "is", null);
  if (error) throw new Error(`listActiveRoleSubscriptionsByEvent 失敗：${error.message}`);
  return (data ?? []) as NotificationSubscriptionRow[];
}

export async function listAllSubscriptions(
  supabase: SupabaseClient,
): Promise<NotificationSubscriptionRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listAllSubscriptions 失敗：${error.message}`);
  return (data ?? []) as NotificationSubscriptionRow[];
}

export interface CreateSubscriptionInput {
  event_code: EventCode;
  /** target_id / target_role 至少要有一個（DB CHECK constraint 也擋這個） */
  target_id?: string | null;
  target_role?: string | null;
  template_code?: string | null;
  filter_rules?: Record<string, unknown>;
  is_active?: boolean;
}

export async function createSubscription(
  supabase: SupabaseClient,
  input: CreateSubscriptionInput,
): Promise<NotificationSubscriptionRow> {
  if (!input.target_id && !input.target_role) {
    throw new Error("createSubscription 失敗：target_id 與 target_role 至少要填一個");
  }
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      event_code: input.event_code,
      target_id: input.target_id ?? null,
      target_role: input.target_role ?? null,
      template_code: input.template_code ?? null,
      filter_rules: input.filter_rules ?? {},
      is_active: input.is_active ?? true,
      brand_id: (await getActiveScope()).brand_id,
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

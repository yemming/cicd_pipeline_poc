import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChannelCode,
  DeliveryStatus,
  EventCode,
  NotificationDeliveryRow,
} from "../types";

const TABLE = "notification_deliveries";

export interface CreatePendingDeliveryInput {
  event_code: EventCode;
  event_payload: Record<string, unknown>;
  subscription_id: string | null;
  channel_code: ChannelCode;
  target_ref: string;
  template_code: string | null;
}

export async function createPendingDelivery(
  supabase: SupabaseClient,
  input: CreatePendingDeliveryInput,
): Promise<NotificationDeliveryRow> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      ...input,
      status: "pending" as DeliveryStatus,
      attempts: 0,
    })
    .select("*")
    .single();
  if (error || !data)
    throw new Error(`createPendingDelivery 失敗：${error?.message ?? "unknown"}`);
  return data as NotificationDeliveryRow;
}

export async function markDeliverySent(
  supabase: SupabaseClient,
  id: string,
  opts: { providerMessageId?: string; renderedBody: unknown; attempts: number },
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({
      status: "sent" as DeliveryStatus,
      rendered_body: opts.renderedBody,
      attempts: opts.attempts,
      sent_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", id);
  if (error) throw new Error(`markDeliverySent 失敗：${error.message}`);
}

export async function markDeliveryFailed(
  supabase: SupabaseClient,
  id: string,
  opts: { error: string; renderedBody: unknown; attempts: number },
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({
      status: "failed" as DeliveryStatus,
      rendered_body: opts.renderedBody,
      attempts: opts.attempts,
      last_error: opts.error,
    })
    .eq("id", id);
  if (error) throw new Error(`markDeliveryFailed 失敗：${error.message}`);
}

export async function getDeliveryById(
  supabase: SupabaseClient,
  id: string,
): Promise<NotificationDeliveryRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getDeliveryById 失敗：${error.message}`);
  return (data as NotificationDeliveryRow | null) ?? null;
}

export interface ListDeliveriesFilter {
  eventCode?: EventCode;
  channelCode?: ChannelCode;
  status?: DeliveryStatus;
  targetRef?: string;
  /** ISO 字串 */
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function listDeliveries(
  supabase: SupabaseClient,
  filter: ListDeliveriesFilter = {},
): Promise<NotificationDeliveryRow[]> {
  let q = supabase.from(TABLE).select("*");
  if (filter.eventCode) q = q.eq("event_code", filter.eventCode);
  if (filter.channelCode) q = q.eq("channel_code", filter.channelCode);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.targetRef) q = q.eq("target_ref", filter.targetRef);
  if (filter.from) q = q.gte("created_at", filter.from);
  if (filter.to) q = q.lte("created_at", filter.to);

  q = q.order("created_at", { ascending: false });
  if (typeof filter.limit === "number") {
    const from = filter.offset ?? 0;
    q = q.range(from, from + filter.limit - 1);
  }

  const { data, error } = await q;
  if (error) throw new Error(`listDeliveries 失敗：${error.message}`);
  return (data ?? []) as NotificationDeliveryRow[];
}

/** Dashboard 統計用 — 給定時區 / 時間範圍內的 status 次數 */
export async function countDeliveriesByStatus(
  supabase: SupabaseClient,
  since: string,
): Promise<Record<DeliveryStatus, number>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("status")
    .gte("created_at", since);
  if (error) throw new Error(`countDeliveriesByStatus 失敗：${error.message}`);

  const counts: Record<DeliveryStatus, number> = {
    pending: 0,
    sent: 0,
    failed: 0,
    retrying: 0,
  };
  for (const row of data ?? []) {
    const s = (row as { status: DeliveryStatus }).status;
    if (s in counts) counts[s]++;
  }
  return counts;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChannelCode,
  EventCode,
  NotificationTemplateRow,
} from "../types";

const TABLE = "notification_templates";

/**
 * 找 DB 端的模板覆寫（event + channel match、且 is_active = true）。
 * 若 code 參數有提供，優先以 code 精準比對；否則取同 event+channel 下 updated_at 最新一筆。
 */
export async function findTemplateOverride(
  supabase: SupabaseClient,
  opts: { eventCode: EventCode; channelCode: ChannelCode; code?: string | null },
): Promise<NotificationTemplateRow | null> {
  let q = supabase
    .from(TABLE)
    .select("*")
    .eq("event_code", opts.eventCode)
    .eq("channel_code", opts.channelCode)
    .eq("is_active", true);

  if (opts.code) {
    q = q.eq("code", opts.code);
  }

  const { data, error } = await q.order("updated_at", { ascending: false }).limit(1);
  if (error) throw new Error(`findTemplateOverride 失敗：${error.message}`);
  const row = data?.[0];
  return (row as NotificationTemplateRow | undefined) ?? null;
}

export async function listTemplates(
  supabase: SupabaseClient,
): Promise<NotificationTemplateRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("event_code")
    .order("channel_code");
  if (error) throw new Error(`listTemplates 失敗：${error.message}`);
  return (data ?? []) as NotificationTemplateRow[];
}

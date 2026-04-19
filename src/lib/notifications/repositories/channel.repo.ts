import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelCode, NotificationChannelRow } from "../types";

const TABLE = "notification_channels";

export async function listActiveChannels(
  supabase: SupabaseClient,
): Promise<NotificationChannelRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("is_active", true)
    .order("code");
  if (error) throw new Error(`listActiveChannels 失敗：${error.message}`);
  return (data ?? []) as NotificationChannelRow[];
}

export async function getChannelByCode(
  supabase: SupabaseClient,
  code: ChannelCode,
): Promise<NotificationChannelRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(`getChannelByCode 失敗：${error.message}`);
  return (data as NotificationChannelRow | null) ?? null;
}

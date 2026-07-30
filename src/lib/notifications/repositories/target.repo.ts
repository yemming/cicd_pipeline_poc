import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  ChannelCode,
  NotificationTargetRow,
  TargetType,
} from "../types";
const TABLE = "notification_targets";

export async function listTargets(
  supabase: SupabaseClient,
  opts: { channelCode?: ChannelCode; onlyActive?: boolean } = {},
): Promise<Array<NotificationTargetRow & { channel_code: ChannelCode }>> {
  let q = supabase
    .from(TABLE)
    .select("*, channel:notification_channels!inner(code)")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("created_at", { ascending: false });
  if (opts.onlyActive !== false) q = q.eq("is_active", true);
  if (opts.channelCode) q = q.eq("channel.code", opts.channelCode);

  const { data, error } = await q;
  if (error) throw new Error(`listTargets 失敗：${error.message}`);

  // 把 join 結果扁平化
  return (data ?? []).map((row) => {
    const typed = row as NotificationTargetRow & { channel?: { code: ChannelCode } };
    return { ...typed, channel_code: typed.channel?.code ?? ("line" as ChannelCode) };
  });
}

export async function getTargetById(
  supabase: SupabaseClient,
  id: string,
): Promise<NotificationTargetRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getTargetById 失敗：${error.message}`);
  return (data as NotificationTargetRow | null) ?? null;
}

/**
 * 依 id 列表撈 target，刻意不帶 brand_id 過濾。
 *
 * 用途：訂閱表的 target_id 有時指向「別的品牌自己的」target（例如 indian 的
 * 事件借用 ducati 那個真的有人在看的 LINE 群組當暫代收件人）——dispatch 端
 * （listActiveByEvent）本來就沒擋這種跨品牌引用，是設計上允許的彈性，只是
 * listTargets() 會依目前 scope 的 brand_id 過濾，導致「事件底下顯示的收件人」
 * 對到一個不在目前品牌清單裡的 target 時，UI 會誤判成「已刪除」。這支函式讓
 * 呼叫端可以額外把這些「別品牌但仍有效」的 target 撈回來、補進顯示清單。
 */
export async function listTargetsByIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Array<NotificationTargetRow & { channel_code: ChannelCode }>> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select("*, channel:notification_channels!inner(code)")
    .in("id", ids);
  if (error) throw new Error(`listTargetsByIds 失敗：${error.message}`);
  return (data ?? []).map((row) => {
    const typed = row as NotificationTargetRow & { channel?: { code: ChannelCode } };
    return { ...typed, channel_code: typed.channel?.code ?? ("line" as ChannelCode) };
  });
}

export interface CreateTargetInput {
  channel_id: string;
  target_type: TargetType;
  target_ref: string;
  display_name: string;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
}

export async function createTarget(
  supabase: SupabaseClient,
  input: CreateTargetInput,
): Promise<NotificationTargetRow> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      channel_id: input.channel_id,
      target_type: input.target_type,
      target_ref: input.target_ref,
      display_name: input.display_name,
      metadata: input.metadata ?? {},
      is_active: input.is_active ?? true,
      brand_id: (await getActiveScope()).brand_id,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`createTarget 失敗：${error?.message ?? "unknown"}`);
  return data as NotificationTargetRow;
}

export async function updateTarget(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Omit<CreateTargetInput, "channel_id">>,
): Promise<NotificationTargetRow> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(`updateTarget 失敗：${error?.message ?? "unknown"}`);
  return data as NotificationTargetRow;
}

export async function deleteTarget(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(`deleteTarget 失敗：${error.message}`);
}

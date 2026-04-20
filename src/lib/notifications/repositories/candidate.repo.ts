import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "notification_target_candidates";

export type CandidateTargetType = "user" | "group" | "room";
export type CandidateDiscoveredVia = "follow" | "join" | "message" | "manual";

export interface CandidateRow {
  id: string;
  channel_code: string;
  target_type: CandidateTargetType;
  target_ref: string;
  discovered_via: CandidateDiscoveredVia;
  source_user_id: string | null;
  display_name: string | null;
  last_message_text: string | null;
  last_seen_at: string;
  message_count: number;
  promoted_target_id: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertCandidateInput {
  channel_code: string;
  target_type: CandidateTargetType;
  target_ref: string;
  discovered_via: CandidateDiscoveredVia;
  source_user_id?: string | null;
  display_name?: string | null;
  last_message_text?: string | null;
}

/**
 * Upsert：第一次看到 → insert；之後同 ref → 更新 last_seen_at + message_count++
 *（display_name 若有新值就覆蓋；舊有空值才填）
 */
export async function upsertCandidate(
  supabase: SupabaseClient,
  input: UpsertCandidateInput,
): Promise<CandidateRow> {
  const { data: existing } = await supabase
    .from(TABLE)
    .select("*")
    .eq("channel_code", input.channel_code)
    .eq("target_ref", input.target_ref)
    .maybeSingle();

  if (existing) {
    const row = existing as CandidateRow;
    const patch: Record<string, unknown> = {
      last_seen_at: new Date().toISOString(),
      message_count: (row.message_count ?? 0) + 1,
    };
    if (input.display_name && (!row.display_name || row.display_name !== input.display_name)) {
      patch.display_name = input.display_name;
    }
    if (input.last_message_text != null) {
      patch.last_message_text = input.last_message_text;
    }
    if (input.source_user_id && !row.source_user_id) {
      patch.source_user_id = input.source_user_id;
    }
    const { data, error } = await supabase
      .from(TABLE)
      .update(patch)
      .eq("id", row.id)
      .select("*")
      .single();
    if (error || !data) throw new Error(`upsertCandidate (update) 失敗：${error?.message ?? "unknown"}`);
    return data as CandidateRow;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      channel_code: input.channel_code,
      target_type: input.target_type,
      target_ref: input.target_ref,
      discovered_via: input.discovered_via,
      source_user_id: input.source_user_id ?? null,
      display_name: input.display_name ?? null,
      last_message_text: input.last_message_text ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`upsertCandidate (insert) 失敗：${error?.message ?? "unknown"}`);
  return data as CandidateRow;
}

/** 後台用：列出尚未 promote 也沒被 dismiss 的候選（最近看到的在前） */
export async function listPendingCandidates(supabase: SupabaseClient): Promise<CandidateRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .is("promoted_target_id", null)
    .is("dismissed_at", null)
    .order("last_seen_at", { ascending: false });
  if (error) throw new Error(`listPendingCandidates 失敗：${error.message}`);
  return (data as CandidateRow[]) ?? [];
}

export async function getCandidateById(
  supabase: SupabaseClient,
  id: string,
): Promise<CandidateRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getCandidateById 失敗：${error.message}`);
  return (data as CandidateRow | null) ?? null;
}

export async function markCandidatePromoted(
  supabase: SupabaseClient,
  id: string,
  targetId: string,
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ promoted_target_id: targetId })
    .eq("id", id);
  if (error) throw new Error(`markCandidatePromoted 失敗：${error.message}`);
}

export async function dismissCandidate(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`dismissCandidate 失敗：${error.message}`);
}

export async function reviveCandidate(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ dismissed_at: null })
    .eq("id", id);
  if (error) throw new Error(`reviveCandidate 失敗：${error.message}`);
}

'use server';

/**
 * RAG Chat domain — sessions / messages CRUD + askInSession server action
 *
 * sessions / messages 已用 RLS 守 user_id + brand。這層 helper 只做業務組合：
 * 收到 user question → retrieve → 跑 Gemini → 寫 user message + assistant message → 回 result
 */

import 'server-only';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { getActiveScope } from '@/lib/scope/active-scope';
import { getCurrentUserContext } from '@/lib/rbac/policies';
import { retrieveContext, type RetrievedChunk } from '@/lib/ai/rag-retrieve';
import {
  generateChatAnswer,
  type ChatHistoryMessage,
} from '@/lib/ai/rag-chat';

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type ChatSession = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  retrieved_chunks: RetrievedChunk[] | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  created_at: string;
  /** 用戶對這條 assistant message 的回饋（client-side join 帶上） */
  feedback?: { rating: 'up' | 'down'; reason: string | null } | null;
};

// ─── sessions ─────────────────────────────────────────────

export async function listSessions(limit = 30): Promise<ChatSession[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('chat_sessions')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as ChatSession[];
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('chat_messages')
    .select(
      'id, session_id, role, content, retrieved_chunks, tokens_in, tokens_out, latency_ms, created_at',
    )
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  const rows = (data ?? []) as ChatMessage[];

  // 一次撈這個 session 內所有 assistant message 的 feedback、attach 到對應 row
  const assistantIds = rows.filter((r) => r.role === 'assistant').map((r) => r.id);
  if (assistantIds.length > 0) {
    const { data: fb } = await supabase
      .from('chat_message_feedback')
      .select('message_id, rating, reason')
      .in('message_id', assistantIds);
    const fbMap = new Map(
      (fb ?? []).map((f) => [
        f.message_id as string,
        { rating: f.rating as 'up' | 'down', reason: f.reason as string | null },
      ]),
    );
    for (const r of rows) {
      if (r.role === 'assistant') r.feedback = fbMap.get(r.id) ?? null;
    }
  }
  return rows;
}

/** 對 assistant message 給 👍/👎，重複按同 rating = 撤回、不同 rating = 改評 */
export async function recordFeedback(
  messageId: string,
  rating: 'up' | 'down',
  reason?: string,
): Promise<Result<{ rating: 'up' | 'down' | null }>> {
  const supabase = await createClient();
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: '未登入' };

  // 看當前有沒有同 user 評過
  const { data: existing } = await supabase
    .from('chat_message_feedback')
    .select('id, rating')
    .eq('message_id', messageId)
    .eq('created_by', ctx.userId)
    .maybeSingle();

  // 同 rating → 撤回（delete）
  if (existing && existing.rating === rating) {
    const { error } = await supabase
      .from('chat_message_feedback')
      .delete()
      .eq('id', existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { rating: null } };
  }

  // 已存在但不同 rating → update
  if (existing) {
    const { error } = await supabase
      .from('chat_message_feedback')
      .update({
        rating,
        reason: reason ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { rating } };
  }

  // 新評
  const { error } = await supabase.from('chat_message_feedback').insert({
    message_id: messageId,
    rating,
    reason: reason ?? null,
    created_by: ctx.userId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { rating } };
}

export async function createSession(): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: '未登入' };

  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({ brand_id: brandId, user_id: ctx.userId })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'unknown' };
  revalidatePath('/ai-curve/chat');
  return { ok: true, data: { id: data.id as string } };
}

/** 刪 message — 給「編輯重發」「重新生成」用，刪後 client 重新 streamAnswer */
export async function deleteMessages(ids: string[]): Promise<Result<{ count: number }>> {
  if (ids.length === 0) return { ok: true, data: { count: 0 } };
  const supabase = await createClient();
  const { error } = await supabase.from('chat_messages').delete().in('id', ids);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { count: ids.length } };
}

export async function deleteSession(sessionId: string): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', sessionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/ai-curve/chat');
  return { ok: true, data: { id: sessionId } };
}

// ─── askInSession：核心 ───────────────────────────────────

export type AskResult = {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
};

export async function askInSession(
  sessionId: string,
  question: string,
): Promise<Result<AskResult>> {
  if (!question.trim()) return { ok: false, error: '問題不能空白' };

  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  // 確認 session 屬於當前 user（RLS 已守、這邊取資料順便驗證）
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id, title')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: 'session 不存在或沒權限' };

  // 取歷史 messages 當 chat context
  const { data: history } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  const historyMessages: ChatHistoryMessage[] = (history ?? []).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content as string,
  }));

  // 先寫入 user message（即使後面 AI 失敗，user input 留住）
  const { data: userRow, error: userErr } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role: 'user',
      content: question.trim(),
    })
    .select('*')
    .single();
  if (userErr || !userRow) {
    return { ok: false, error: `寫 user message 失敗：${userErr?.message}` };
  }

  // Retrieve + Generate
  let retrieved: RetrievedChunk[] = [];
  let assistantContent = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let latencyMs = 0;

  try {
    retrieved = await retrieveContext(supabase, question, { brandId, topK: 8 });
    const ans = await generateChatAnswer(question, historyMessages, retrieved);
    assistantContent = ans.content;
    tokensIn = ans.tokensIn;
    tokensOut = ans.tokensOut;
    latencyMs = ans.latencyMs;
  } catch (e) {
    assistantContent = `（AI 出錯：${(e as Error).message}）`;
  }

  const { data: assistantRow, error: aErr } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role: 'assistant',
      content: assistantContent,
      retrieved_chunks: retrieved.length > 0 ? retrieved : null,
      tokens_in: tokensIn || null,
      tokens_out: tokensOut || null,
      latency_ms: latencyMs || null,
    })
    .select('*')
    .single();
  if (aErr || !assistantRow) {
    return { ok: false, error: `寫 assistant message 失敗：${aErr?.message}` };
  }

  // session 第一條問題 → 自動把 title 設成問題前 30 字
  if (!session.title) {
    const title = question.trim().slice(0, 30);
    await supabase
      .from('chat_sessions')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', sessionId);
  } else {
    await supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);
  }

  revalidatePath('/ai-curve/chat');
  return {
    ok: true,
    data: {
      userMessage: userRow as unknown as ChatMessage,
      assistantMessage: assistantRow as unknown as ChatMessage,
    },
  };
}

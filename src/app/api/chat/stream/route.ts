import type { NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getActiveScope } from '@/lib/scope/active-scope';
import { retrieveContext, type RetrievedChunk } from '@/lib/ai/rag-retrieve';
import { streamChatAnswer } from '@/lib/ai/rag-chat';

/**
 * SSE streaming chat — 取代既有的 askInSession server action
 *
 * 流程：
 *   1. 寫 user message
 *   2. 拿 history（去掉剛寫的 user）
 *   3. RAG retrieve top-K
 *   4. 開 ReadableStream、邊收 Gemini chunks 邊發 SSE event 給 client
 *   5. stream 結束時：寫 assistant message + 更新 session title/updated_at
 *   6. final event 帶 assistant_message_id 給 client
 *
 * SSE event 格式：
 *   meta:  { type: 'meta', userMessage, retrieved }    開頭、給 UI 顯示 user msg + citations
 *   text:  { type: 'text', text: '...' }                 增量文字
 *   done:  { type: 'done', assistantMessage }            結尾、含完整 assistant message row
 *   error: { type: 'error', message: '...' }
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { sessionId?: string; question?: string }
    | null;
  const sessionId = body?.sessionId;
  const question = body?.question?.trim();
  if (!sessionId || !question) {
    return new Response('Missing sessionId or question', { status: 400 });
  }

  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  // 驗證 session 是這個 user 的（RLS 順便守、撈不到就 401）
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id, title')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) {
    return new Response('Session not found or no access', { status: 404 });
  }

  // 先寫 user message（即使後面 AI 失敗、user 輸入也留住）
  const { data: userRow, error: userErr } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role: 'user',
      content: question,
    })
    .select(
      'id, session_id, role, content, retrieved_chunks, tokens_in, tokens_out, latency_ms, created_at',
    )
    .single();
  if (userErr || !userRow) {
    return new Response(`Failed to insert user message: ${userErr?.message}`, {
      status: 500,
    });
  }

  // 拿 history（去掉剛剛插入的這一條）
  const { data: historyRows } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  const history = (historyRows ?? [])
    .filter((r) => r.id !== userRow.id)
    .map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content as string,
    }));

  // Retrieve（失敗不致命、繼續用空 context）
  let retrieved: RetrievedChunk[] = [];
  try {
    retrieved = await retrieveContext(supabase, question, { brandId, topK: 8 });
  } catch (e) {
    console.warn('[chat-stream] retrieve 失敗:', (e as Error).message);
  }

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, obj: unknown) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
  };

  const stream = new ReadableStream({
    async start(controller) {
      // 1. 開頭 meta：user message + retrieved chunks（client 立刻渲染 citations）
      send(controller, { type: 'meta', userMessage: userRow, retrieved });

      let fullText = '';
      let tokensIn = 0;
      let tokensOut = 0;
      let latencyMs = 0;
      let errored = false;

      try {
        for await (const ev of streamChatAnswer(question, history, retrieved)) {
          if (ev.type === 'text') {
            send(controller, { type: 'text', text: ev.text });
            fullText += ev.text;
          } else if (ev.type === 'done') {
            tokensIn = ev.tokensIn;
            tokensOut = ev.tokensOut;
            latencyMs = ev.latencyMs;
            if (ev.fullText) fullText = ev.fullText;
          }
        }
      } catch (e) {
        errored = true;
        const errMsg = `（AI 出錯：${(e as Error).message}）`;
        send(controller, { type: 'text', text: errMsg });
        fullText = errMsg;
      }

      // 2. 寫 assistant message
      const { data: assistantRow } = await supabase
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          role: 'assistant',
          content: fullText,
          retrieved_chunks:
            retrieved.length > 0 && !errored ? retrieved : null,
          tokens_in: tokensIn || null,
          tokens_out: tokensOut || null,
          latency_ms: latencyMs || null,
        })
        .select(
          'id, session_id, role, content, retrieved_chunks, tokens_in, tokens_out, latency_ms, created_at',
        )
        .single();

      // 3. session title / updated_at
      if (!session.title) {
        const title = question.slice(0, 30);
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

      // 4. final event
      send(controller, { type: 'done', assistantMessage: assistantRow });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

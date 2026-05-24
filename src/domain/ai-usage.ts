'use server';

/**
 * AI usage 統計 — chat / 語音手卡 / 名片 / RAG embedding 各模組 token 用量 + cost 試算
 *
 * Gemini 2.5 Flash pricing（2025-08+）：
 *   text input  $0.30 / 1M
 *   audio input $1.00 / 1M
 *   output      $2.50 / 1M
 *   embedding (gemini-embedding-001) $0.15 / 1M
 */

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getActiveScope } from '@/lib/scope/active-scope';
import { PRICING, USD_TO_TWD } from '@/lib/ai/pricing';

export type ModuleUsage = {
  module: 'chat' | 'voice_handcard' | 'business_card' | 'embedding';
  label: string;
  count: number; // 訊息 / 紀錄 數
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
};

export type DailyUsage = {
  date: string; // YYYY-MM-DD
  chat_count: number;
  total_tokens: number;
  cost_usd: number;
};

export type UsageSummary = {
  range_label: string;
  modules: ModuleUsage[];
  daily: DailyUsage[];
  total_cost_usd: number;
  total_cost_twd: number;
  rag_chunks_total: number;
  manuals_chunks_total: number;
};

function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}


export async function getMonthlyUsage(): Promise<UsageSummary> {
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();
  const since = startOfMonth();

  const [chatRes, voiceRes, cardRes, ragRes, manualRes] = await Promise.all([
    // chat_messages — 透過 session join brand
    supabase
      .from('chat_messages')
      .select('tokens_in, tokens_out, created_at, chat_sessions!inner(brand_id)')
      .eq('chat_sessions.brand_id', brandId)
      .gte('created_at', since),
    // handcard_voice_notes
    supabase
      .from('handcard_voice_notes')
      .select('ai_tokens_in, ai_tokens_out, created_at')
      .eq('brand_id', brandId)
      .gte('created_at', since),
    // business_card_scans
    supabase
      .from('business_card_scans')
      .select('ai_tokens_in, ai_tokens_out, created_at')
      .eq('brand_id', brandId)
      .gte('created_at', since),
    // rag_chunks 本月新增
    supabase
      .from('rag_chunks')
      .select('content, created_at')
      .eq('brand_id', brandId)
      .gte('created_at', since),
    // manuals total chunks（手冊 embedding 屬一次性、累積看）
    supabase
      .from('manuals')
      .select('total_chunks')
      .eq('brand_id', brandId),
  ]);

  // chat
  const chatRows = (chatRes.data ?? []) as Array<{
    tokens_in: number | null;
    tokens_out: number | null;
    created_at: string;
  }>;
  const chatTokensIn = chatRows.reduce((s, r) => s + (r.tokens_in ?? 0), 0);
  const chatTokensOut = chatRows.reduce((s, r) => s + (r.tokens_out ?? 0), 0);
  const chatCost =
    (chatTokensIn * PRICING.TEXT_INPUT_PER_M + chatTokensOut * PRICING.OUTPUT_PER_M) /
    1_000_000;

  // voice handcard（audio input）
  const voiceRows = (voiceRes.data ?? []) as Array<{
    ai_tokens_in: number | null;
    ai_tokens_out: number | null;
    created_at: string;
  }>;
  const voiceTokensIn = voiceRows.reduce((s, r) => s + (r.ai_tokens_in ?? 0), 0);
  const voiceTokensOut = voiceRows.reduce((s, r) => s + (r.ai_tokens_out ?? 0), 0);
  // 簡化：voice 端 input 一律算 audio rate（實際 = audio + system prompt text、誤差小）
  const voiceCost =
    (voiceTokensIn * PRICING.AUDIO_INPUT_PER_M +
      voiceTokensOut * PRICING.OUTPUT_PER_M) /
    1_000_000;

  // business card（image input）— 走 text rate（image token 跟 text 同 tier）
  const cardRows = (cardRes.data ?? []) as Array<{
    ai_tokens_in: number | null;
    ai_tokens_out: number | null;
    created_at: string;
  }>;
  const cardTokensIn = cardRows.reduce((s, r) => s + (r.ai_tokens_in ?? 0), 0);
  const cardTokensOut = cardRows.reduce((s, r) => s + (r.ai_tokens_out ?? 0), 0);
  const cardCost =
    (cardTokensIn * PRICING.TEXT_INPUT_PER_M + cardTokensOut * PRICING.OUTPUT_PER_M) /
    1_000_000;

  // embedding — 用 chunk content 字數估 token（中文 1.5 / 字）
  const ragRows = (ragRes.data ?? []) as Array<{
    content: string;
    created_at: string;
  }>;
  const embedTokens = ragRows.reduce((s, r) => s + estimateTokens(r.content), 0);
  const embedCost = (embedTokens * PRICING.EMBEDDING_PER_M) / 1_000_000;

  const manualsRows = (manualRes.data ?? []) as Array<{ total_chunks: number | null }>;
  const manualsChunks = manualsRows.reduce((s, r) => s + (r.total_chunks ?? 0), 0);

  // daily 聚合（30 天）
  const dailyMap = new Map<string, DailyUsage>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, {
      date: key,
      chat_count: 0,
      total_tokens: 0,
      cost_usd: 0,
    });
  }
  for (const r of chatRows) {
    const key = r.created_at.slice(0, 10);
    const day = dailyMap.get(key);
    if (!day) continue;
    day.chat_count += 1;
    day.total_tokens += (r.tokens_in ?? 0) + (r.tokens_out ?? 0);
    day.cost_usd +=
      ((r.tokens_in ?? 0) * PRICING.TEXT_INPUT_PER_M +
        (r.tokens_out ?? 0) * PRICING.OUTPUT_PER_M) /
      1_000_000;
  }
  const daily = Array.from(dailyMap.values());

  const modules: ModuleUsage[] = [
    {
      module: 'chat',
      label: 'AI 問答對話',
      count: chatRows.length,
      tokens_in: chatTokensIn,
      tokens_out: chatTokensOut,
      cost_usd: chatCost,
    },
    {
      module: 'voice_handcard',
      label: '語音接待手卡',
      count: voiceRows.length,
      tokens_in: voiceTokensIn,
      tokens_out: voiceTokensOut,
      cost_usd: voiceCost,
    },
    {
      module: 'business_card',
      label: '名片 OCR',
      count: cardRows.length,
      tokens_in: cardTokensIn,
      tokens_out: cardTokensOut,
      cost_usd: cardCost,
    },
    {
      module: 'embedding',
      label: 'RAG 向量化（含手冊）',
      count: ragRows.length,
      tokens_in: embedTokens,
      tokens_out: 0,
      cost_usd: embedCost,
    },
  ];

  const totalCostUsd = modules.reduce((s, m) => s + m.cost_usd, 0);
  const now = new Date();
  const rangeLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')} 月初至今`;

  return {
    range_label: rangeLabel,
    modules,
    daily,
    total_cost_usd: totalCostUsd,
    total_cost_twd: totalCostUsd * USD_TO_TWD,
    rag_chunks_total: ragRows.length,
    manuals_chunks_total: manualsChunks,
  };
}

function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0x3040 && cp <= 0x30ff) ||
      (cp >= 0xac00 && cp <= 0xd7af)
    ) {
      cjk++;
    } else {
      other++;
    }
  }
  return Math.ceil(cjk * 1.5 + other / 4);
}

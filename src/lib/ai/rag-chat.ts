/**
 * RAG Chat — Gemini 2.5 Flash + retrieved context + 多輪 history
 *
 * 拼 prompt 結構：
 *   [system instruction] 角色定義 + 引用規則 + 反幻覺
 *   [context block]      top-K chunks with source labels
 *   [history]           最近 N 輪 user / assistant message
 *   [user]              當下這條問題
 */

import 'server-only';

import type { RetrievedChunk, RagSourceType } from './rag-retrieve';

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_HISTORY_TURNS = 6; // 最近 6 輪 user+assistant pair

const SYSTEM_PROMPT = `你是 Ducati / Indian 機車經銷商的內部助理。你幫業務 / 技師 / 服務顧問
回答「原廠手冊技術問題」「客戶 / 車輛 / 修車紀錄問題」「銷售互動 follow-up」三類問題。

【極重要的反幻覺規則】
- 你只能根據下面提供的 [上下文] 來回答
- 上下文不足 → 直說「我查不到相關資料」，不要編、不要從常識補
- 不准引用沒在上下文出現的條目（手冊頁碼 / RO code / 客戶名）
- 上下文裡的車型若跟 user 問的車型對不上、要明說「你問的是 X、但我找到的是 Y 的資料」

【引用規則】
- 回答完之後用「【來源】」區塊列出引用的條目
- 手冊類：寫「《手冊標題》第 N 頁」
- 工單類：寫「工單 RO-XXX」
- 客戶 / 車輛 / 接待錄音 / 名片：寫「客戶資料 / 接待紀錄 / 名片」+ 對應代碼

【語氣】
- 繁體中文（台灣）
- 直接、精簡
- 數字 / 規格 / 工時 / 金額 都要從上下文 copy 出來、不要四捨五入或改寫
`;

export type ChatHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type RagChatResult = {
  content: string;
  citedChunks: RetrievedChunk[]; // 真正在回答中被引用到的 chunks（這版先全給）
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
};

export async function generateChatAnswer(
  userMessage: string,
  history: ChatHistoryMessage[],
  retrieved: RetrievedChunk[],
): Promise<RagChatResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY 沒設');

  // 組 context block
  const contextBlock = formatContextBlock(retrieved);

  // history 只保留最近 N 輪
  const recentHistory = history.slice(-MAX_HISTORY_TURNS * 2);

  // Gemini 用 contents[]，role 是 "user" / "model"
  const contents = [
    ...recentHistory.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    {
      role: 'user',
      parts: [
        {
          text: `[上下文 — 從知識庫檢索 ${retrieved.length} 筆相關資料]\n\n${contextBlock}\n\n---\n\n[使用者問題]\n${userMessage}`,
        },
      ],
    },
  ];

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      temperature: 0.2,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const t0 = Date.now();
  const resp = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const latencyMs = Date.now() - t0;

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini chat ${resp.status}：${errText.slice(0, 300)}`);
  }

  const result = await resp.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 沒回 text');
  const usage = result.usageMetadata ?? {};

  return {
    content: text,
    citedChunks: retrieved,
    tokensIn: usage.promptTokenCount ?? 0,
    tokensOut: usage.candidatesTokenCount ?? 0,
    latencyMs,
  };
}

function formatContextBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '（沒有檢索到任何相關資料）';
  return chunks
    .map((c, idx) => {
      const label = sourceLabel(c.sourceType, c.metadata);
      const sim = (c.similarity * 100).toFixed(0);
      return `[#${idx + 1} ${label} ・ 相似度 ${sim}%]\n${c.content}`;
    })
    .join('\n\n---\n\n');
}

function sourceLabel(
  sourceType: RagSourceType,
  metadata: Record<string, unknown>,
): string {
  switch (sourceType) {
    case 'manual': {
      const title = (metadata.title as string) ?? '原廠手冊';
      const page = metadata.page as number | null | undefined;
      return page ? `《${title}》第 ${page} 頁` : `《${title}》`;
    }
    case 'repair_order': {
      const code = (metadata.ro_code as string) ?? '—';
      return `工單 ${code}`;
    }
    case 'final_inspection': {
      const no = (metadata.inspection_no as string) ?? '—';
      return `最終檢驗 ${no}`;
    }
    case 'customer': {
      const code = (metadata.customer_code as string) ?? '—';
      return `客戶資料 ${code}`;
    }
    case 'handcard_voice':
      return '接待錄音紀錄';
    case 'business_card':
      return '名片掃描';
  }
}

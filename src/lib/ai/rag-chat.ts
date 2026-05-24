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
import { resolveLabel, resolveShortLabel } from './rag-registry';

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const STREAM_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`;
const MAX_HISTORY_TURNS = 6; // 最近 6 輪 user+assistant pair

const SYSTEM_PROMPT = `你是 Ducati / Indian 機車經銷商的內部助理。你幫業務 / 技師 / 服務顧問
回答「原廠手冊技術問題」「客戶 / 車輛 / 修車紀錄問題」「銷售互動 follow-up」三類問題。

【知識庫範圍 — 你被檢索的內容只有這些】
你的 RAG 索引涵蓋 7 種 source：
1. 原廠手冊（Owner Manual PDF 抽取段落）
2. 維修工單 repair_orders
3. 最終檢驗 final_inspections
4. 客戶主檔 customers（+ 名下車輛 + 近期工單摘要）
5. 接待錄音紀錄 handcard_voice_notes
6. 名片掃描 business_card_scans
7. 電子發票 einvoices

【遇到「查不到」時的正確回應方式】
- 第一步：明確說出你檢索到了什麼（譬如「我有 C00019 孫燕姿這位客戶的資料，但沒有她
  的車輛或維修紀錄」）
- 第二步：判斷用戶要找的東西是否在上述 7 種範圍內：
  · 在範圍但確實沒資料 → 講「目前資料庫沒有這筆」
  · 不在範圍 → 明說「我的知識庫目前涵蓋 [手冊/工單/客戶/檢驗/錄音/名片/發票]，
    你要找的『XXX』不在裡面，請直接到對應的管理頁面查」並建議路徑
    （銷售訂單 → /sales、預約 → /service/appointments、車輛庫存 → /inventory/vehicles 等）
- 禁止：丟一句「我查不到」就走、不要編造「無法直接確認」這種模糊話術

【其他反幻覺規則】
- 你只能根據下面提供的 [上下文] 來回答
- 不准引用沒在上下文出現的條目（手冊頁碼 / RO code / 客戶名 / 發票號）
- 上下文裡的車型若跟 user 問的車型對不上、要明說「你問的是 X、但我找到的是 Y 的資料」

【代詞與 follow-up（多輪對話必看）】
- 用戶用「它 / 他 / 她 / 那 / 那台車 / 這個客戶 / 它的紀錄 / 他最近」等代詞時、
  優先用前一兩輪對話的 entity 解讀、不要反問「請問是指哪位客戶」
- 例：上輪講了車牌 IMC-001、下輪問「那它有沒有維修紀錄」→ 直接答 IMC-001 的工單
- 例：上輪提到孫燕姿、下輪問「她最近有來嗎」→ 直接查孫燕姿、不要反問

【容錯 / Fuzzy match】
- 用戶可能打錯字（例「孫燕資」→「孫燕姿」、「林志林」→「林志玲」），優先用音近 /
  形近的客戶。如果上下文裡有相似客戶就直接答、不要反問
- 車牌格式不固定（IMC001 / IMC-001 / imc001 都當同一台）

【引用規則】
- 回答完之後用「【來源】」區塊列出引用的條目
- 手冊類：寫「《手冊標題》第 N 頁」
- 工單類：寫「工單 RO-XXX」
- 客戶 / 車輛 / 接待錄音 / 名片：寫「客戶資料 / 接待紀錄 / 名片」+ 對應代碼

【格式】
- 用 Markdown：列表用 \`-\`、強調用 \`**bold**\`、code 用反引號
- 多筆並列資料用 bullet list、不要把工單摘要全擠一段
- 數字 / 規格 / 工時 / 金額 / 日期 直接 copy 上下文、不四捨五入不改寫

【語氣】
- 繁體中文（台灣）
- 直接、精簡、像同事間講話，不要過度客套
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

// ─── Streaming 版（給 SSE Route Handler 用） ─────────────────────

export type StreamEvent =
  | { type: 'text'; text: string }
  | {
      type: 'done';
      fullText: string;
      tokensIn: number;
      tokensOut: number;
      latencyMs: number;
    };

export async function* streamChatAnswer(
  userMessage: string,
  history: ChatHistoryMessage[],
  retrieved: RetrievedChunk[],
): AsyncGenerator<StreamEvent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY 沒設');

  const contextBlock = formatContextBlock(retrieved);
  const recentHistory = history.slice(-MAX_HISTORY_TURNS * 2);

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
  const resp = await fetch(`${STREAM_ENDPOINT}&key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok || !resp.body) {
    const errText = await resp.text();
    throw new Error(`Gemini stream ${resp.status}：${errText.slice(0, 300)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let chunkN = 0;
  let eventN = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunkN++;
    const incoming = decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    buffer += incoming;

    // Line-based parser：Gemini streamGenerateContent 實測每個 event 就是一行
    // `data: {...}\n`，部分情況才接空行（標準 SSE 用 \n\n 分隔，但 Gemini 不嚴格）。
    // 改成按 \n 切、每行如果是 `data: ` 開頭就 parse 一次、可靠很多
    let nlIdx;
    while ((nlIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nlIdx);
      buffer = buffer.slice(nlIdx + 1);
      if (!line.startsWith('data: ')) continue; // 空行 / 非 data 行直接跳
      eventN++;
      const json = line.slice(6);
      if (!json.trim()) continue;
      try {
        const parsed = JSON.parse(json);
        const txt = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        const finishReason = parsed?.candidates?.[0]?.finishReason;
        if (finishReason && finishReason !== 'STOP') {
          console.warn(
            '[stream] finishReason 非 STOP:',
            finishReason,
            '/ raw:',
            line.slice(0, 300),
          );
        }
        if (txt) {
          fullText += txt;
          yield { type: 'text', text: txt };
        }
        const usage = parsed.usageMetadata;
        if (usage) {
          tokensIn = usage.promptTokenCount ?? tokensIn;
          tokensOut = usage.candidatesTokenCount ?? tokensOut;
        }
      } catch (e) {
        console.warn(
          '[stream] parse 失敗:',
          (e as Error).message,
          '/ raw:',
          json.slice(0, 200),
        );
      }
    }
  }

  if (!fullText) {
    console.warn(
      `[stream] 結束但 fullText 是空：chunks=${chunkN} events=${eventN} buffer="${buffer.slice(0, 200)}"`,
    );
  }

  yield {
    type: 'done',
    fullText,
    tokensIn,
    tokensOut,
    latencyMs: Date.now() - t0,
  };
}

// ─── 工具：給 streaming 端 reuse ─────────────────────────────────

export function formatContextBlock(chunks: RetrievedChunk[]): string {
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
  // manual 特例：保留《》格式 + 頁碼
  if (sourceType === 'manual') {
    const title = (metadata.title as string) ?? '原廠手冊';
    const page = metadata.page as number | null | undefined;
    return page ? `《${title}》第 ${page} 頁` : `《${title}》`;
  }
  const label = resolveLabel(sourceType);
  const short = resolveShortLabel(sourceType, metadata);
  return short === label ? label : `${label} ${short}`;
}

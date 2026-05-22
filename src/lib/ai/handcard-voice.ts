/**
 * Gemini 2.5 Flash：手卡接待錄音 → 轉錄 + 8 欄位抽取
 *
 * 走 REST inline data（<15MB audio、可直接 base64 塞 request body）。
 * 5 分鐘 webm/opus ≈ 2-3 MB、5min m4a ≈ 2-3 MB，POC 範圍內無需 Gemini File API。
 *
 * 環境變數：GEMINI_API_KEY
 */

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const INLINE_LIMIT_BYTES = 15 * 1024 * 1024;

const SYSTEM_PROMPT = `你是 Ducati / Indian 機車經銷商的接待手卡助理。
業務（RS）會給你一段現場接待客戶的錄音、你的工作是轉錄與抽欄位。

【極重要的反幻覺規則 — 違反就是嚴重錯誤】
- 你只能根據 audio 內**實際聽到的聲音內容**作答
- 如果 audio 是靜音、雜訊、聽不清、或時間太短聽不出對話內容：
  → transcript 必須留空字串 ""（絕對不准編造對話、不准放範例、不准用「假想客戶」）
  → 8 個欄位的 value 全部留空字串或合理 default、confidence 全部給 0.0
  → evidence_quote 全部留空字串
- 你**不准**在 transcript 裡放任何 audio 沒講過的話
- 你**不准**從 system prompt 的描述「想像」一段標準對話塞給我
- 寧可留空、不要猜、不要編

【正常情況下的工作】
1. transcript：完整逐字繁中、保留口語、保留客戶與業務雙方發言、不修飾不改寫
2. 從對話抽取 8 個欄位，每欄附 confidence (0.0-1.0) 與 evidence_quote（**必須從 transcript 裡 copy 出原句證據**、不准重寫成自己的話）

8 個欄位：
- customer_summary（string）：1-2 句客戶需求摘要
- intent_level（integer 1-5）：1=隨便看看 / 3=明確意向 / 5=當天可下訂
- purchase_timing（enum: now/3m/6m/explore）：購車時機
- intended_models（string array）：客戶提到的意向機車型號（保留英文原文）
- competitor_brand（string）：客戶提到的真正競品品牌（**Ducati 跟 Indian 都是我們經銷的、不算競品**；只有 Honda/BMW/Kawasaki/Yamaha/KTM/Triumph/Harley-Davidson/SYM 等才算）
- followup_date（string YYYY-MM-DD）：下次追蹤日期；如果客戶說「5月30」這種沒年份的、用最接近未來的那個日期
- arrival_source（string）：來店管道（朋友介紹 / 網路搜尋 / 路過 / 老客戶回流 / 廣告 / 其他）
- budget_range（string）：客戶提到的預算（例「100 萬上下」「50-80 萬」）；保留客戶原話的口語表達

機車型號 / 品牌請保留英文原文。某欄位在對話中沒被提及 → value 空字串 / 空陣列 / 合理 default、confidence=0.0、evidence_quote 留空。`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    transcript: { type: "string" },
    suggestions: {
      type: "object",
      properties: {
        customer_summary: {
          type: "object",
          properties: {
            value: { type: "string" },
            confidence: { type: "number" },
            evidence_quote: { type: "string" },
          },
          required: ["value", "confidence", "evidence_quote"],
        },
        intent_level: {
          type: "object",
          properties: {
            value: { type: "integer", minimum: 1, maximum: 5 },
            confidence: { type: "number" },
            evidence_quote: { type: "string" },
          },
          required: ["value", "confidence", "evidence_quote"],
        },
        purchase_timing: {
          type: "object",
          properties: {
            value: { type: "string", enum: ["now", "3m", "6m", "explore"] },
            confidence: { type: "number" },
            evidence_quote: { type: "string" },
          },
          required: ["value", "confidence", "evidence_quote"],
        },
        intended_models: {
          type: "object",
          properties: {
            value: { type: "array", items: { type: "string" } },
            confidence: { type: "number" },
            evidence_quote: { type: "string" },
          },
          required: ["value", "confidence", "evidence_quote"],
        },
        competitor_brand: {
          type: "object",
          properties: {
            value: { type: "string" },
            confidence: { type: "number" },
            evidence_quote: { type: "string" },
          },
          required: ["value", "confidence", "evidence_quote"],
        },
        followup_date: {
          type: "object",
          properties: {
            value: { type: "string" },
            confidence: { type: "number" },
            evidence_quote: { type: "string" },
          },
          required: ["value", "confidence", "evidence_quote"],
        },
        arrival_source: {
          type: "object",
          properties: {
            value: { type: "string" },
            confidence: { type: "number" },
            evidence_quote: { type: "string" },
          },
          required: ["value", "confidence", "evidence_quote"],
        },
        budget_range: {
          type: "object",
          properties: {
            value: { type: "string" },
            confidence: { type: "number" },
            evidence_quote: { type: "string" },
          },
          required: ["value", "confidence", "evidence_quote"],
        },
      },
      required: [
        "customer_summary",
        "intent_level",
        "purchase_timing",
        "intended_models",
        "competitor_brand",
        "followup_date",
        "arrival_source",
        "budget_range",
      ],
    },
  },
  required: ["transcript", "suggestions"],
} as const;

export type SuggestionField<T = string | number> = {
  value: T;
  confidence: number;
  evidence_quote: string;
};

export type HandcardVoiceSuggestions = {
  customer_summary: SuggestionField<string>;
  intent_level: SuggestionField<number>;
  purchase_timing: SuggestionField<"now" | "3m" | "6m" | "explore">;
  intended_models: SuggestionField<string[]>;
  competitor_brand: SuggestionField<string>;
  followup_date: SuggestionField<string>;
  arrival_source: SuggestionField<string>;
  budget_range: SuggestionField<string>;
};

export type GeminiVoiceResult = {
  transcript: string;
  suggestions: HandcardVoiceSuggestions;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
};

export async function transcribeAndExtract(
  audio: Buffer,
  mimeType: string,
): Promise<GeminiVoiceResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY 沒設");
  if (audio.byteLength === 0) throw new Error("audio file 是空的");
  if (audio.byteLength > INLINE_LIMIT_BYTES) {
    throw new Error(
      `audio 太大（${(audio.byteLength / 1024 / 1024).toFixed(1)} MB > 15 MB，POC 不支援、需要走 Gemini File API）`,
    );
  }

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: audio.toString("base64") } },
          { text: "請依 schema 回 JSON。" },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.1,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const t0 = Date.now();
  const resp = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const latencyMs = Date.now() - t0;

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini ${resp.status}：${errText.slice(0, 300)}`);
  }

  const result = await resp.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini 沒回 text");

  const parsed = JSON.parse(text);
  const usage = result.usageMetadata ?? {};

  return {
    transcript: parsed.transcript ?? "",
    suggestions: parsed.suggestions,
    latencyMs,
    tokensIn: usage.promptTokenCount ?? 0,
    tokensOut: usage.candidatesTokenCount ?? 0,
  };
}

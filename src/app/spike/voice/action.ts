"use server";

/**
 * Spike server action：吃 audio → Gemini 2.5 Flash → 回 transcript + suggestions JSON
 *
 * 這支只給 /spike/voice 頁面 dev 驗證用。不接 Supabase Storage、不寫 DB。
 * 正式版會搬到 src/lib/ai/ + src/lib/voice-upload/，先別 reuse 這支。
 */

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `你是 Ducati / Indian 機車經銷商的接待手卡助理。
業務（RS）會給你一段現場接待客戶的錄音、你的工作是轉錄與抽欄位。

【極重要的反幻覺規則 — 違反就是嚴重錯誤】
- 你只能根據 audio 內**實際聽到的聲音內容**作答
- 如果 audio 是靜音、雜訊、聽不清、或時間太短聽不出對話內容：
  → transcript 必須留空字串 ""（絕對不准編造對話、不准放範例、不准用「假想客戶」）
  → 5 個欄位的 value 全部留空字串或合理 default、confidence 全部給 0.0
  → evidence_quote 全部留空字串
- 你**不准**在 transcript 裡放任何 audio 沒講過的話
- 你**不准**從 system prompt 的描述「想像」一段標準對話塞給我
- 寧可留空、不要猜、不要編

【正常情況下的工作】
1. transcript：完整逐字繁中、保留口語、保留客戶與業務雙方發言、不修飾不改寫
2. 從對話抽取 5 個欄位，每欄附 confidence (0.0-1.0) 與 evidence_quote（**必須從 transcript 裡 copy 出原句證據**、不准重寫成自己的話）

機車型號 / 品牌請保留英文原文。某欄位在對話中沒被提及 → value 空字串或合理 default、confidence=0.0、evidence_quote 留空。`;

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
      },
      required: [
        "customer_summary",
        "intent_level",
        "purchase_timing",
        "competitor_brand",
        "followup_date",
      ],
    },
  },
  required: ["transcript", "suggestions"],
};

export type SuggestionField = {
  value: string | number;
  confidence: number;
  evidence_quote: string;
};

export type SpikeResult =
  | {
      ok: true;
      transcript: string;
      suggestions: {
        customer_summary: SuggestionField;
        intent_level: SuggestionField;
        purchase_timing: SuggestionField;
        competitor_brand: SuggestionField;
        followup_date: SuggestionField;
      };
      latencyMs: number;
      sizeBytes: number;
      mimeType: string;
      tokens: { prompt: number; output: number; total: number };
    }
  | { ok: false; error: string };

export async function transcribeAndExtract(
  formData: FormData,
): Promise<SpikeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY 沒設" };

  const file = formData.get("audio");
  if (!(file instanceof File)) return { ok: false, error: "缺 audio file" };

  const arrayBuf = await file.arrayBuffer();
  const sizeBytes = arrayBuf.byteLength;
  if (sizeBytes === 0) return { ok: false, error: "audio file 是空的" };
  if (sizeBytes > 15 * 1024 * 1024) {
    return { ok: false, error: `audio 太大（${(sizeBytes / 1024 / 1024).toFixed(1)} MB > 15 MB）` };
  }

  const mimeType = file.type || "audio/webm";
  const base64 = Buffer.from(arrayBuf).toString("base64");

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: base64 } },
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
  let resp: Response;
  try {
    resp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { ok: false, error: `Gemini fetch 失敗：${(e as Error).message}` };
  }
  const latencyMs = Date.now() - t0;

  if (!resp.ok) {
    const errText = await resp.text();
    return { ok: false, error: `Gemini ${resp.status}：${errText.slice(0, 300)}` };
  }

  const result = await resp.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return { ok: false, error: "Gemini 沒回 text" };

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `JSON parse 失敗：${(e as Error).message}` };
  }

  const usage = result.usageMetadata ?? {};
  return {
    ok: true,
    transcript: parsed.transcript ?? "",
    suggestions: parsed.suggestions,
    latencyMs,
    sizeBytes,
    mimeType,
    tokens: {
      prompt: usage.promptTokenCount ?? 0,
      output: usage.candidatesTokenCount ?? 0,
      total: usage.totalTokenCount ?? 0,
    },
  };
}

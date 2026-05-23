/**
 * Gemini 2.5 Flash Vision：名片照片 → 9 欄結構化資料抽取
 *
 * 走 REST inline data（image base64 直接塞 request body）。
 * 一般手機拍照 1-3 MB、壓縮過後 < 1 MB，POC 範圍內無需 Gemini File API。
 *
 * 環境變數：GEMINI_API_KEY（跟 handcard-voice 共用）
 */

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const INLINE_LIMIT_BYTES = 15 * 1024 * 1024;

const SYSTEM_PROMPT = `你是 Ducati / Indian 機車經銷商的客戶建檔助理。
業務（RS）會給你一張現場接到的名片照片、你的工作是從名片影像抽出聯絡資訊。

【極重要的反幻覺規則 — 違反就是嚴重錯誤】
- 你只能根據圖片上**實際看得到的文字**作答
- 如果圖片是模糊、太暗、不是名片、或無法判讀：
  → 9 個欄位的 value 全部留空字串或空陣列、confidence 全部給 0.0
  → evidence_quote 全部留空字串
- 你**不准**從訓練資料或常識編造名片上沒出現的姓名、公司、職稱、電話、信箱、地址
- 你**不准**自己「補全」缺漏（例如名片上只寫「02-2345-6789」不准自動加區碼或國碼變「+886-2-2345-6789」）
- 寧可留空、不要猜、不要編

【正常情況下的工作】
從名片影像抽取 9 個欄位，每欄附 confidence (0.0-1.0) 與 evidence_quote
（**必須從名片上 copy 出原文字**、不准重寫成自己的話）

9 個欄位：
- name（string）：客戶姓名（中文名保留中文、英文名保留英文原樣）
- company（string）：客戶任職的公司全名（保留股份有限公司 / Co., Ltd 等正式字樣）
- title（string）：職稱 / 部門（例「業務經理」「行銷部 副總」「Sales Director」）
- phone_mobile（string）：行動電話（保留名片原本的格式：含或不含區碼、有沒有空格 dash 都照抄）
- phone_office（string）：公司電話 / 分機（同上保留原格式）
- email（string）：Email
- address（string）：地址（整段地址原樣抄錄）
- line_id（string）：LINE ID（名片有寫「LINE ID: xxx」這類純文字才抓；只有 QR code 沒文字一律留空）
- notes（string）：其他文字內容（公司 slogan、官網、社群帳號、傳真、其他補充）

某欄位在名片上沒出現 → value 留空字串、confidence=0.0、evidence_quote 留空。`;

const FIELD_SCHEMA = {
  type: "object",
  properties: {
    value: { type: "string" },
    confidence: { type: "number" },
    evidence_quote: { type: "string" },
  },
  required: ["value", "confidence", "evidence_quote"],
} as const;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "object",
      properties: {
        name: FIELD_SCHEMA,
        company: FIELD_SCHEMA,
        title: FIELD_SCHEMA,
        phone_mobile: FIELD_SCHEMA,
        phone_office: FIELD_SCHEMA,
        email: FIELD_SCHEMA,
        address: FIELD_SCHEMA,
        line_id: FIELD_SCHEMA,
        notes: FIELD_SCHEMA,
      },
      required: [
        "name",
        "company",
        "title",
        "phone_mobile",
        "phone_office",
        "email",
        "address",
        "line_id",
        "notes",
      ],
    },
  },
  required: ["suggestions"],
} as const;

export type SuggestionField = {
  value: string;
  confidence: number;
  evidence_quote: string;
};

export type BusinessCardSuggestions = {
  name: SuggestionField;
  company: SuggestionField;
  title: SuggestionField;
  phone_mobile: SuggestionField;
  phone_office: SuggestionField;
  email: SuggestionField;
  address: SuggestionField;
  line_id: SuggestionField;
  notes: SuggestionField;
};

export type GeminiBusinessCardResult = {
  suggestions: BusinessCardSuggestions;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
};

export async function extractBusinessCard(
  image: Buffer,
  mimeType: string,
): Promise<GeminiBusinessCardResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY 沒設");
  if (image.byteLength === 0) throw new Error("image 是空的");
  if (image.byteLength > INLINE_LIMIT_BYTES) {
    throw new Error(
      `image 太大（${(image.byteLength / 1024 / 1024).toFixed(1)} MB > 15 MB）`,
    );
  }

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: image.toString("base64") } },
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
    suggestions: parsed.suggestions,
    latencyMs,
    tokensIn: usage.promptTokenCount ?? 0,
    tokensOut: usage.candidatesTokenCount ?? 0,
  };
}

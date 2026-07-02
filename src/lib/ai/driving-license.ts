/**
 * Gemini 2.5 Flash Vision：駕照照片 → 8 欄結構化資料抽取
 *
 * 走 REST inline data（image base64 直接塞 request body）。
 * 一般手機拍照 1-3 MB、壓縮過後 < 1 MB，POC 範圍內無需 Gemini File API。
 *
 * 環境變數：GEMINI_API_KEY（跟 handcard-voice / business-card 共用）
 */

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const INLINE_LIMIT_BYTES = 15 * 1024 * 1024;

const SYSTEM_PROMPT = `你是機車經銷商的試駕登記助理。
業務（RS）會給你一張客戶的台灣駕照照片、你的工作是從駕照影像抽出登記試駕所需的資訊。

【極重要的反幻覺規則 — 違反就是嚴重錯誤】
- 你只能根據圖片上**實際看得到的文字**作答
- 如果圖片是模糊、太暗、不是駕照、或無法判讀：
  → 8 個欄位的 value 全部留空字串、confidence 全部給 0.0
  → evidence_quote 全部留空字串
- 你**不准**從訓練資料或常識編造駕照上沒出現的姓名、號碼、地址
- 你**不准**自己「補全」缺漏（例如駕照號碼模糊看不清不准自己生一個）
- 寧可留空、不要猜、不要編

【台灣機車駕照欄位辨識】
台灣的機車駕照種類欄位常見值（請完整抓出組合）：
- 普通重型機車 (普重)
- 大型重型機車 A1 (250cc 以上)
- 大型重型機車 A2 (550cc 以上)
- 普通輕型機車 (普輕)
- 小型輕型機車 (小輕)
若駕照上同時持有多種，請以「、」連接（例「普重、大型重型 A1」）

【正常情況下的工作】
從駕照影像抽取 8 個欄位，每欄附 confidence (0.0-1.0) 與 evidence_quote
（**必須從駕照上 copy 出原文字**、不准重寫成自己的話）

8 個欄位：
- name（string）：駕駛人姓名（中文名保留中文）
- license_no（string）：駕照號碼（含英文字母與數字、保留原樣 dash / 空白都照抄）
- license_class（string）：駕照種類（用上面列出的台灣機車駕照種類；多種以「、」連接）
- birthday（string）：出生日期（保留駕照原樣，民國年或西元年都不要轉換、原樣抄）
- expires_at（string）：有效期限（同上原樣抄、不要轉換）
- gender（string）：性別（男 / 女，駕照沒明寫就留空）
- address（string）：戶籍地址（整段地址原樣抄錄）
- issued_by（string）：發照單位（例「交通部公路局臺北市區監理所」「臺中區監理所」）

某欄位在駕照上沒出現 → value 留空字串、confidence=0.0、evidence_quote 留空。`;

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
        license_no: FIELD_SCHEMA,
        license_class: FIELD_SCHEMA,
        birthday: FIELD_SCHEMA,
        expires_at: FIELD_SCHEMA,
        gender: FIELD_SCHEMA,
        address: FIELD_SCHEMA,
        issued_by: FIELD_SCHEMA,
      },
      required: [
        "name",
        "license_no",
        "license_class",
        "birthday",
        "expires_at",
        "gender",
        "address",
        "issued_by",
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

export type DrivingLicenseSuggestions = {
  name: SuggestionField;
  license_no: SuggestionField;
  license_class: SuggestionField;
  birthday: SuggestionField;
  expires_at: SuggestionField;
  gender: SuggestionField;
  address: SuggestionField;
  issued_by: SuggestionField;
};

export type GeminiDrivingLicenseResult = {
  suggestions: DrivingLicenseSuggestions;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
};

export async function extractDrivingLicense(
  image: Buffer,
  mimeType: string,
): Promise<GeminiDrivingLicenseResult> {
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

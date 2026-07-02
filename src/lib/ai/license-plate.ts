/**
 * Gemini 2.5 Flash Vision — 機車車牌 OCR
 *
 * 反幻覺嚴格：看不清楚回空字串、信心度 0；不准猜、不准補。
 * 環境變數：GEMINI_API_KEY
 */

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const INLINE_LIMIT_BYTES = 15 * 1024 * 1024;

const SYSTEM_PROMPT = `你是機車經銷商的車牌辨識助理。
業務 / 技師會給你一張機車進站的照片、你的工作是 OCR 出車牌號碼。

【極重要的反幻覺規則 — 違反就是嚴重錯誤】
- 你只能根據圖片上**實際看得到的車牌字元**作答
- 如果圖片：
  → 看不到任何車牌 → plate 留空字串 ""、confidence = 0.0
  → 車牌模糊 / 反光 / 被遮 → plate 留空字串 ""、confidence = 0.0
  → 不是機車 / 不是台灣車牌 → plate 留空字串 ""、confidence = 0.0
- 你**不准**從車型 / 品牌 / 顏色 推測車牌號碼
- 你**不准**自己「補全」缺漏字元（如看不清最後一碼、不准猜）
- 寧可留空、不要猜、不要編

【正常情況下的工作】
回傳：
- plate（string）：車牌字串，**保留照片上原本的格式**（含 dash / 空格、英文大寫、數字），譬如「ABC-1234」「IMC-001」「7M-9876」
- confidence（float 0.0-1.0）：自信度。模糊 / 反光 / 遮住一半 都應該降到 0.5 以下
- evidence（string）：照片中你看到的車牌區域描述（給人類驗證用），譬如「左後方車牌、白底黑字、無遮擋」

【台灣機車車牌格式參考】（不是 hard rule，看到的是什麼就 OCR 什麼）
- 舊式（小型機車）：3 數字 + 2 英文，如 123-ABC
- 新式（大型重機）：2 英文 + 4 數字，如 ABC-1234 / IMC-001 / 7M-9876
- 試車牌 / 臨時牌：紅底白字、格式不一
`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    plate: { type: 'string' },
    confidence: { type: 'number' },
    evidence: { type: 'string' },
  },
  required: ['plate', 'confidence', 'evidence'],
} as const;

export type LicensePlateResult = {
  plate: string;
  confidence: number;
  evidence: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
};

export async function recognizeLicensePlate(
  image: Buffer,
  mimeType: string,
): Promise<LicensePlateResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY 沒設');
  if (image.byteLength === 0) throw new Error('image 是空的');
  if (image.byteLength > INLINE_LIMIT_BYTES) {
    throw new Error(`image 太大（${(image.byteLength / 1024 / 1024).toFixed(1)} MB > 15 MB）`);
  }

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: image.toString('base64') } },
          { text: '請依 schema 回 JSON。' },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.1,
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
    throw new Error(`Gemini ${resp.status}：${errText.slice(0, 300)}`);
  }

  const result = await resp.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 沒回 text');
  const parsed = JSON.parse(text);
  const usage = result.usageMetadata ?? {};

  return {
    plate: (parsed.plate ?? '').toString(),
    confidence: Number(parsed.confidence ?? 0),
    evidence: (parsed.evidence ?? '').toString(),
    latencyMs,
    tokensIn: usage.promptTokenCount ?? 0,
    tokensOut: usage.candidatesTokenCount ?? 0,
  };
}

/** 正規化車牌：去掉所有空白 / dash、英文全大寫，給 DB lookup 用 */
export function normalizePlate(plate: string): string {
  return plate.replace(/[\s\-_]/g, '').toUpperCase();
}

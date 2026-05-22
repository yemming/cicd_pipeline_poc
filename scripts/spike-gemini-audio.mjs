#!/usr/bin/env node
/**
 * Spike：Gemini 2.5 Flash 吃 audio → 回 transcript + 結構化欄位抽取
 *
 * 用法：
 *   node scripts/spike-gemini-audio.mjs <audio-file-path>
 *
 * 環境：GEMINI_API_KEY 從 .env.local 讀（或當下 env 已 export）。
 *
 * 目的：驗證手卡錄音 → AI 抽欄位這條路線。獨立 Node 腳本、不污染專案 deps。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ───────────── 載 .env.local（dotenv 風格、極簡 parser、不依賴套件） ─────────────
function loadEnvLocal() {
  const envPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    ".env.local",
  );
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key]) continue; // 不覆寫既有
    let val = rawVal.trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
loadEnvLocal();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("❌ GEMINI_API_KEY not set (.env.local missing it)");
  process.exit(1);
}

const audioPath = process.argv[2];
if (!audioPath) {
  console.error("用法：node scripts/spike-gemini-audio.mjs <audio-file-path>");
  process.exit(1);
}
if (!fs.existsSync(audioPath)) {
  console.error(`❌ 找不到 audio 檔：${audioPath}`);
  process.exit(1);
}

// ───────────── MIME sniff（副檔名 → mime）─────────────
const EXT_TO_MIME = {
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
};
const ext = path.extname(audioPath).toLowerCase();
const mimeType = EXT_TO_MIME[ext];
if (!mimeType) {
  console.error(`❌ 不認得的副檔名：${ext}（支援 ${Object.keys(EXT_TO_MIME).join(", ")}）`);
  process.exit(1);
}

const audioBuffer = fs.readFileSync(audioPath);
const audioSizeKB = (audioBuffer.length / 1024).toFixed(1);
const audioBase64 = audioBuffer.toString("base64");

console.log(`📁 audio:     ${audioPath}`);
console.log(`📐 size:      ${audioSizeKB} KB`);
console.log(`🎙️  mime:      ${mimeType}`);
console.log(`🤖 model:     gemini-2.5-flash`);
console.log("");

// ───────────── 欄位 schema（對 RS01 wizard 5 個高價值欄位） ─────────────
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    transcript: {
      type: "string",
      description: "完整逐字稿（繁體中文、保留口語、不修飾）",
    },
    suggestions: {
      type: "object",
      properties: {
        customer_summary: {
          type: "object",
          properties: {
            value: { type: "string", description: "1-2 句客戶需求摘要" },
            confidence: { type: "number", description: "0.0-1.0" },
            evidence_quote: { type: "string", description: "從轉錄裡引用的關鍵句" },
          },
          required: ["value", "confidence", "evidence_quote"],
        },
        intent_level: {
          type: "object",
          properties: {
            value: {
              type: "integer",
              description: "意向級別 1-5：1=隨便看看 / 3=明確意向 / 5=當天可下訂",
              minimum: 1,
              maximum: 5,
            },
            confidence: { type: "number" },
            evidence_quote: { type: "string" },
          },
          required: ["value", "confidence", "evidence_quote"],
        },
        purchase_timing: {
          type: "object",
          properties: {
            value: {
              type: "string",
              description: "now=當下下訂 / 3m=3個月內 / 6m=半年內 / explore=純探詢",
              enum: ["now", "3m", "6m", "explore"],
            },
            confidence: { type: "number" },
            evidence_quote: { type: "string" },
          },
          required: ["value", "confidence", "evidence_quote"],
        },
        competitor_brand: {
          type: "object",
          properties: {
            value: { type: "string", description: "客戶提到的競品品牌（沒有就空字串）" },
            confidence: { type: "number" },
            evidence_quote: { type: "string" },
          },
          required: ["value", "confidence", "evidence_quote"],
        },
        followup_date: {
          type: "object",
          properties: {
            value: {
              type: "string",
              description: "下次追蹤日期 YYYY-MM-DD（沒提就空字串）",
            },
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

// ───────────── 呼 Gemini ─────────────
const payload = {
  systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
  contents: [
    {
      parts: [
        { inlineData: { mimeType, data: audioBase64 } },
        { text: "請依 schema 回 JSON。" },
      ],
    },
  ],
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: RESPONSE_SCHEMA,
    temperature: 0.1, // 抽欄位要穩、不要創意
    thinkingConfig: { thinkingBudget: 0 }, // 純抽欄位不需要 thinking
  },
};

const t0 = Date.now();
console.log("⏱️  呼叫 Gemini…");

const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
const resp = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

const latencyMs = Date.now() - t0;
console.log(`⏱️  latency:   ${latencyMs} ms (${(latencyMs / 1000).toFixed(1)} s)`);

if (!resp.ok) {
  const errText = await resp.text();
  console.error(`❌ Gemini ${resp.status}：${errText}`);
  process.exit(1);
}

const result = await resp.json();
const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
if (!text) {
  console.error("❌ 沒回 text：", JSON.stringify(result, null, 2));
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(text);
} catch (e) {
  console.error("❌ JSON parse 失敗：", e.message);
  console.error("原文：", text);
  process.exit(1);
}

// ───────────── 印結果 ─────────────
console.log("");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("📜 TRANSCRIPT");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(parsed.transcript);
console.log("");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🎯 SUGGESTIONS");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
for (const [field, info] of Object.entries(parsed.suggestions)) {
  const conf = (info.confidence * 100).toFixed(0).padStart(3);
  const valStr = String(info.value || "(空)").slice(0, 60);
  console.log(`${field.padEnd(20)} ${conf}%  ${valStr}`);
  if (info.evidence_quote) {
    console.log(`${" ".repeat(20)}      ⤷ "${info.evidence_quote.slice(0, 80)}"`);
  }
}
console.log("");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("💰 USAGE");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
const usage = result?.usageMetadata ?? {};
console.log(`prompt tokens:     ${usage.promptTokenCount ?? "-"}`);
console.log(`candidate tokens:  ${usage.candidatesTokenCount ?? "-"}`);
console.log(`total tokens:      ${usage.totalTokenCount ?? "-"}`);
if (usage.promptTokensDetails) {
  for (const d of usage.promptTokensDetails) {
    console.log(`  └ ${d.modality}: ${d.tokenCount}`);
  }
}
console.log("");
console.log("✅ done");

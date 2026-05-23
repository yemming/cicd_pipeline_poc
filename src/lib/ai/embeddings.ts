/**
 * Gemini text-embedding-004：把文字轉成 768 維 vector
 *
 * 走 REST batchEmbedContents（一次最多 100 個 input）。
 * 環境變數：GEMINI_API_KEY（跟其他 ai/* 共用）
 *
 * 中文 + 機車技術文件實測品質足夠、且 $0.0001 / 1M tokens 幾乎免費。
 */

const MODEL = 'gemini-embedding-001';
const EMBED_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`;
const EMBED_DIMS = 768; // 用 outputDimensionality 降到 768，維持 rag_chunks.embedding vector(768)
const CONCURRENCY = 8; // 並發呼叫 single embed（這支 model 沒提供 sync batch）

export const EMBEDDING_MODEL = MODEL;
export const EMBEDDING_DIMENSIONS = EMBED_DIMS;

/**
 * task type 對 RAG 結果有顯著影響：
 *   - RETRIEVAL_DOCUMENT：寫入知識庫的內容（手冊段落 / 紀錄）
 *   - RETRIEVAL_QUERY：用戶查詢的問題
 *  doc / query 互相是 asymmetric embedding、cosine 才會準
 */
export type EmbedTaskType =
  | 'RETRIEVAL_DOCUMENT'
  | 'RETRIEVAL_QUERY'
  | 'SEMANTIC_SIMILARITY';

// ─── 單筆 embed ─────────────────────────────────────────

export async function embedText(
  text: string,
  taskType: EmbedTaskType = 'RETRIEVAL_DOCUMENT',
): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY 沒設');
  if (!text.trim()) throw new Error('embedText: text 是空的');

  const resp = await fetch(`${EMBED_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: EMBED_DIMS,
      taskType,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Embedding ${resp.status}：${errText.slice(0, 300)}`);
  }
  const result = await resp.json();
  const vec = result?.embedding?.values as number[] | undefined;
  if (!vec || vec.length !== EMBED_DIMS) {
    throw new Error(`Embedding 回傳維度異常：${vec?.length}`);
  }
  return vec;
}

// ─── 批量 embed（並發 single calls） ─────────────────────

export async function embedBatch(
  texts: string[],
  taskType: EmbedTaskType = 'RETRIEVAL_DOCUMENT',
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const out: number[][] = new Array(texts.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= texts.length) return;
      out[idx] = await embedText(texts[idx], taskType);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, texts.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return out;
}

// ─── 把 vector 轉成 pgvector 字串格式（"[0.1,0.2,...]"） ─────

export function toPgVector(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

// ─── Chunking ──────────────────────────────────────────

/**
 * Token 數估算（heuristic、不引 tokenizer lib）：
 * - 中文 / 日文 / 韓文 字 ≈ 1.5 token
 * - 其他（英文 / 數字 / 標點）每 4 字元 ≈ 1 token
 * 這個估算對 splitter 邏輯夠用、實際 token 數以 Gemini 回應為準。
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (
      (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
      (cp >= 0x3040 && cp <= 0x30ff) || // Japanese kana
      (cp >= 0xac00 && cp <= 0xd7af) // Hangul
    ) {
      cjk++;
    } else {
      other++;
    }
  }
  return Math.ceil(cjk * 1.5 + other / 4);
}

/**
 * 按段落 → 句子優先邊界切塊。每塊目標 ~600 token、相鄰塊 overlap ~150 token。
 *
 * 不引第三方 tokenizer，純靠段落 / 句子分隔符 + 字元數估算。對技術手冊
 * 與結構化紀錄夠用。
 */
export function chunkText(
  text: string,
  opts: { chunkTokens?: number; overlap?: number } = {},
): string[] {
  const target = opts.chunkTokens ?? 600;
  const overlap = opts.overlap ?? 150;
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];

  // 先依段落（雙換行）切；段落內若太長再依句子（。！？.!?\n）切
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const segments: string[] = [];
  for (const p of paragraphs) {
    if (estimateTokens(p) <= target) {
      segments.push(p);
    } else {
      // 段落太長 → 依句子切
      const sentences = p
        .split(/(?<=[。！？!?])\s+|(?<=[。！？!?])(?=\S)|\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      // 句子也可能還是太長 → 硬切
      for (const s of sentences) {
        if (estimateTokens(s) <= target) {
          segments.push(s);
        } else {
          const charsPerChunk = Math.floor((target * 4) / 1.5); // 取個中庸值
          for (let i = 0; i < s.length; i += charsPerChunk) {
            segments.push(s.slice(i, i + charsPerChunk));
          }
        }
      }
    }
  }

  // 把 segments 按 target token 上限累積成 chunk、塊間 overlap
  const chunks: string[] = [];
  let buf: string[] = [];
  let bufTokens = 0;

  for (const seg of segments) {
    const segTokens = estimateTokens(seg);
    if (bufTokens + segTokens > target && buf.length > 0) {
      chunks.push(buf.join('\n\n'));
      // 留下尾段做 overlap：從 buf 末尾累積 overlap token
      const tail: string[] = [];
      let tailTokens = 0;
      for (let i = buf.length - 1; i >= 0; i--) {
        const t = estimateTokens(buf[i]);
        if (tailTokens + t > overlap) break;
        tail.unshift(buf[i]);
        tailTokens += t;
      }
      buf = tail;
      bufTokens = tailTokens;
    }
    buf.push(seg);
    bufTokens += segTokens;
  }
  if (buf.length > 0) chunks.push(buf.join('\n\n'));

  return chunks;
}

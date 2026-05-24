'use server';

/**
 * Domain Helper — AI Curve 接待錄音紀錄（standalone、不綁特定手卡）
 *
 * 跟 handcard-voice-notes 共用同一張 DB table，但 handcard_id=NULL
 * 表示「AI Curve demo 模式」的錄音。
 *
 * 流程：
 *   recordAiCurveNote(formData) → Storage 上傳 + Gemini + insert row
 *   listRecentAiCurveNotes() → 拉當前 brand 最近 5 筆給 idle state 列表
 */

import 'server-only';

import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getActiveScope } from '@/lib/scope/active-scope';
import { ingestRecordInternal, removeFromRag } from '@/domain/rag-ingest';
import {
  transcribeAndExtract,
  type HandcardVoiceSuggestions,
} from '@/lib/ai/handcard-voice';

const BUCKET = 'handcard-voice-notes';

/**
 * 預算護欄：錄音 60 秒、檔案 3 MB 為 hard cap。
 * 60s opus ~500KB / 60s aac-mp4 ~1MB / 60s mp3 ~1MB，3 MB buffer 夠 + 擋掉長錄音。
 * Client 在 ai-curve-app.tsx 也有 60s 自動停、這層是被繞過時的防線。
 */
const MAX_DURATION_SECONDS = 60;
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type AiCurveNoteResult = {
  noteId: string;
  transcript: string;
  suggestions: HandcardVoiceSuggestions;
  /** 業務之前 review 過的值（從歷史紀錄載入時帶；剛錄完則為 null） */
  reviewedValues: ReviewedHandcardValues | null;
  latencyMs: number;
  sizeBytes: number;
  durationSeconds: number;
  mimeType: string;
  tokensIn: number;
  tokensOut: number;
};

/**
 * 業務 review 後最終確認的 12 欄手卡值
 * 8 個會被 AI 預填、4 個業務手填
 */
export type ReviewedHandcardValues = {
  // 8 AI 欄位
  customer_summary: string;
  intent_level: number; // 0 = 未設、1-5
  purchase_timing: "" | "now" | "3m" | "6m" | "explore";
  intended_models: string[];
  competitor_brand: string;
  budget_range: string;
  arrival_source: string;
  followup_date: string;
  // 4 手填
  customer_name: string;
  customer_phone: string;
  customer_identity: "" | "new" | "revisit" | "owner" | "switcher";
  observation_tags: string[];
};

export type AiCurveNoteListItem = {
  id: string;
  duration_seconds: number | null;
  size_bytes: number | null;
  mime_type: string;
  transcript: string;
  ai_suggestions: HandcardVoiceSuggestions;
  reviewed_values: ReviewedHandcardValues | null;
  reviewed_at: string | null;
  ai_latency_ms: number | null;
  created_at: string;
};

// ────────────────────────── 錄音 → AI 處理 → 入庫 ──────────────────────────

export async function recordAiCurveNote(
  formData: FormData,
): Promise<Result<AiCurveNoteResult>> {
  const audio = formData.get('audio');
  const durationRaw = formData.get('duration_seconds');

  if (!(audio instanceof File)) {
    return { ok: false, error: '缺 audio file' };
  }

  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return { ok: false, error: '未登入' };

  const arrayBuf = await audio.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuf);
  const sizeBytes = audioBuffer.byteLength;
  const mimeType = audio.type || 'audio/webm';

  // 預算護欄 — 在上 Storage 與打 Gemini 之前先擋掉超長 / 超大檔
  if (sizeBytes > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      error: `錄音檔太大（${(sizeBytes / 1024 / 1024).toFixed(2)} MB > ${MAX_AUDIO_BYTES / 1024 / 1024} MB 上限）。請控制在 60 秒內。`,
    };
  }
  const ext = mimeType.includes('mp4')
    ? 'm4a'
    : mimeType.includes('webm')
      ? 'webm'
      : mimeType.includes('mpeg')
        ? 'mp3'
        : 'audio';

  const durationSeconds = (() => {
    if (typeof durationRaw !== 'string') return 0;
    const n = parseInt(durationRaw, 10);
    return Number.isFinite(n) ? n : 0;
  })();

  if (durationSeconds > MAX_DURATION_SECONDS) {
    return {
      ok: false,
      error: `錄音長度 ${durationSeconds} 秒超過 ${MAX_DURATION_SECONDS} 秒上限，請重錄。`,
    };
  }

  // Storage path: <brand>/ai-curve/<ts>-<random>.<ext>
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  const storagePath = `${brandId}/ai-curve/${ts}-${rand}.${ext}`;

  // Step 1：上傳 Storage
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, audioBuffer, { contentType: mimeType, upsert: false });
  if (upErr) return { ok: false, error: `Storage 上傳失敗：${upErr.message}` };

  // Step 2：呼 Gemini（失敗清檔）
  let ai;
  try {
    ai = await transcribeAndExtract(audioBuffer, mimeType);
  } catch (e) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: `AI 失敗：${(e as Error).message}` };
  }

  // Step 3：寫 DB row（handcard_id=NULL → AI Curve standalone）
  const { data: row, error: insErr } = await supabase
    .from('handcard_voice_notes')
    .insert({
      brand_id: brandId,
      handcard_id: null,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      duration_seconds: durationSeconds || null,
      transcript: ai.transcript,
      ai_suggestions: ai.suggestions as unknown as Record<string, unknown>,
      ai_processed_at: new Date().toISOString(),
      ai_latency_ms: ai.latencyMs,
      ai_tokens_in: ai.tokensIn,
      ai_tokens_out: ai.tokensOut,
      created_by: userId,
    })
    .select('id')
    .single();

  if (insErr || !row) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: `寫 DB 失敗：${insErr?.message ?? 'unknown'}` };
  }

  return {
    ok: true,
    data: {
      noteId: row.id,
      transcript: ai.transcript,
      suggestions: ai.suggestions,
      reviewedValues: null,
      latencyMs: ai.latencyMs,
      sizeBytes,
      durationSeconds,
      mimeType,
      tokensIn: ai.tokensIn,
      tokensOut: ai.tokensOut,
    },
  };
}

// ────────────────────────── 業務 review 完儲存 ──────────────────────────

export async function saveReviewedAiCurveNote(
  noteId: string,
  values: ReviewedHandcardValues,
): Promise<Result<{ id: string; reviewedAt: string }>> {
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const reviewedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('handcard_voice_notes')
    .update({
      reviewed_decisions: values as unknown as Record<string, unknown>,
      reviewed_at: reviewedAt,
    })
    .eq('id', noteId)
    .eq('brand_id', brandId)
    .is('handcard_id', null)
    .select('id')
    .single();

  if (error || !data) {
    return { ok: false, error: `儲存失敗：${error?.message ?? 'unknown'}` };
  }
  // review 確認後 → 進 RAG（reviewed_decisions 有 customer_name，命中率才高）
  after(() => ingestRecordInternal('handcard_voice', data.id));
  return { ok: true, data: { id: data.id, reviewedAt } };
}

// ────────────────────────── 刪除 ──────────────────────────

export async function deleteAiCurveNote(
  noteId: string,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  // 撈 storage_path（先刪檔再刪 row、失敗才不會留孤兒 row）
  const { data: row, error: fetchErr } = await supabase
    .from('handcard_voice_notes')
    .select('id, storage_path')
    .eq('id', noteId)
    .eq('brand_id', brandId)
    .is('handcard_id', null)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: `查 note 失敗：${fetchErr.message}` };
  if (!row) return { ok: false, error: '找不到該錄音紀錄' };

  // 刪 Storage（失敗不阻擋 DB delete、留孤兒檔可日後 cron 清）
  if (row.storage_path) {
    await supabase.storage.from(BUCKET).remove([row.storage_path]);
  }

  // 刪 DB row（RLS 已守 brand）
  const { error: delErr } = await supabase
    .from('handcard_voice_notes')
    .delete()
    .eq('id', noteId)
    .eq('brand_id', brandId);

  if (delErr) return { ok: false, error: `刪 DB 失敗：${delErr.message}` };
  after(() => removeFromRag('handcard_voice', noteId));
  return { ok: true, data: { id: noteId } };
}

// ────────────────────────── 列表查詢 ──────────────────────────

export async function listRecentAiCurveNotes(
  limit = 5,
): Promise<AiCurveNoteListItem[]> {
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const { data, error } = await supabase
    .from('handcard_voice_notes')
    .select(
      'id, duration_seconds, size_bytes, mime_type, transcript, ai_suggestions, reviewed_decisions, reviewed_at, ai_latency_ms, created_at',
    )
    .eq('brand_id', brandId)
    .is('handcard_id', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];

  return (data ?? []).map((row) => {
    const rd = row.reviewed_decisions as unknown;
    const reviewed_values =
      rd && typeof rd === 'object' && Object.keys(rd as object).length > 0
        ? (rd as ReviewedHandcardValues)
        : null;
    return {
      id: row.id as string,
      duration_seconds: row.duration_seconds as number | null,
      size_bytes: row.size_bytes as number | null,
      mime_type: row.mime_type as string,
      transcript: row.transcript as string,
      ai_suggestions: row.ai_suggestions as unknown as HandcardVoiceSuggestions,
      reviewed_values,
      reviewed_at: row.reviewed_at as string | null,
      ai_latency_ms: row.ai_latency_ms as number | null,
      created_at: row.created_at as string,
    };
  });
}

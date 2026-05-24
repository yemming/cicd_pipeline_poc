'use server';

/**
 * 原廠手冊管理 — upload / list / delete / reindex
 *
 * Upload 流程：
 *   1. 收 PDF/DOCX/TXT → 上 Storage bucket "manuals"
 *   2. INSERT manuals row (status='pending')
 *   3. 用 Next 16 `after()` 觸發背景 ingestManual()：
 *      parse PDF → chunk → batchEmbed → upsert rag_chunks → update manuals
 *
 * 失敗時 manuals.status='failed' + error_message 留 admin 看。
 */

import 'server-only';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { getActiveScope } from '@/lib/scope/active-scope';
import { getCurrentUserContext, requirePermission } from '@/lib/rbac/policies';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { extractDocText } from '@/lib/ai/pdf-parse';
import { chunkText, embedBatch, EMBEDDING_MODEL, toPgVector } from '@/lib/ai/embeddings';

const BUCKET = 'manuals';
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 天

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type ManualListItem = {
  id: string;
  title: string;
  description: string | null;
  mime_type: string;
  size_bytes: number | null;
  page_count: number | null;
  total_chunks: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  error_message: string | null;
  ingested_at: string | null;
  created_at: string;
  signed_url: string;
  vehicle_model_ids: string[];
};

export type VehicleModelOption = {
  id: string;
  display_name: string;
};

export async function listVehicleModelOptions(): Promise<VehicleModelOption[]> {
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();
  const { data } = await supabase
    .from('vehicle_models')
    .select('id, display_name')
    .eq('brand_id', brandId)
    .eq('is_active', true)
    .order('display_name');
  return (data ?? []) as VehicleModelOption[];
}

// ─── upload ──────────────────────────────────────────────────

export async function uploadManual(
  formData: FormData,
): Promise<Result<{ manualId: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT); // MVP：複用 customer.edit（admin 群組擁有）

  const file = formData.get('file');
  const title = (formData.get('title') as string | null)?.trim() || '';
  const description = (formData.get('description') as string | null)?.trim() || null;
  // 多選車型：modelIds 用 JSON 字串 ['uuid1', 'uuid2'] 傳
  const modelIdsRaw = formData.get('vehicle_model_ids') as string | null;
  let vehicleModelIds: string[] = [];
  if (modelIdsRaw) {
    try {
      const parsed = JSON.parse(modelIdsRaw);
      if (Array.isArray(parsed)) vehicleModelIds = parsed.filter((x) => typeof x === 'string');
    } catch {
      /* ignore */
    }
  }
  if (!(file instanceof File)) return { ok: false, error: '缺檔案' };
  if (!title) return { ok: false, error: '手冊標題必填' };

  // 接 PDF / DOCX / TXT；其餘擋下避免亂吃
  const mimeType = file.type || 'application/octet-stream';
  const filename = file.name?.toLowerCase() || '';
  const isPdf = mimeType.includes('pdf') || filename.endsWith('.pdf');
  const isDocx =
    mimeType.includes('wordprocessingml') ||
    mimeType.includes('msword') ||
    filename.endsWith('.docx');
  const isTxt =
    mimeType.includes('text/plain') ||
    mimeType.includes('text/markdown') ||
    filename.endsWith('.txt') ||
    filename.endsWith('.md');
  if (!isPdf && !isDocx && !isTxt) {
    return { ok: false, error: `不支援的檔案類型：${mimeType}（僅 PDF / DOCX / TXT）` };
  }
  // 修正 mimeType（瀏覽器有時送錯）
  const normalizedMime = isPdf
    ? 'application/pdf'
    : isDocx
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'text/plain';

  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: '未登入' };

  const buffer = Buffer.from(await file.arrayBuffer());
  const sizeBytes = buffer.byteLength;
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  const ext = isPdf ? 'pdf' : isDocx ? 'docx' : 'txt';
  const storagePath = `${brandId}/${ts}-${rand}.${ext}`;

  // 上傳 Storage
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: normalizedMime, upsert: false });
  if (upErr) return { ok: false, error: `Storage 上傳失敗：${upErr.message}` };

  // 建主檔 row
  const { data: row, error: insErr } = await supabase
    .from('manuals')
    .insert({
      brand_id: brandId,
      title,
      description,
      storage_path: storagePath,
      mime_type: normalizedMime,
      size_bytes: sizeBytes,
      status: 'pending',
      uploaded_by: ctx.userId,
      vehicle_model_ids: vehicleModelIds,
    })
    .select('id')
    .single();
  if (insErr || !row) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: `寫 DB 失敗：${insErr?.message ?? 'unknown'}` };
  }

  const manualId = row.id as string;

  // 背景跑 ingestion（不阻擋 UI 回應）
  after(async () => {
    await runIngest(manualId);
  });

  revalidatePath('/admin/manuals');
  return { ok: true, data: { manualId } };
}

// ─── list / get / delete / reindex ────────────────────────────

export async function listManuals(): Promise<ManualListItem[]> {
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();
  const { data } = await supabase
    .from('manuals')
    .select(
      'id, title, description, mime_type, size_bytes, page_count, total_chunks, status, error_message, ingested_at, created_at, storage_path, vehicle_model_ids',
    )
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false });

  const items: ManualListItem[] = [];
  for (const row of data ?? []) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.storage_path as string, SIGNED_URL_TTL);
    items.push({
      id: row.id as string,
      title: row.title as string,
      description: row.description as string | null,
      mime_type: row.mime_type as string,
      size_bytes: row.size_bytes as number | null,
      page_count: row.page_count as number | null,
      total_chunks: row.total_chunks as number,
      status: row.status as ManualListItem['status'],
      error_message: row.error_message as string | null,
      ingested_at: row.ingested_at as string | null,
      created_at: row.created_at as string,
      signed_url: signed?.signedUrl ?? '',
      vehicle_model_ids: (row.vehicle_model_ids as string[] | null) ?? [],
    });
  }
  return items;
}

export async function deleteManual(id: string): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const { data: row } = await supabase
    .from('manuals')
    .select('storage_path')
    .eq('id', id)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (!row) return { ok: false, error: '找不到該手冊' };

  // 先刪 rag_chunks 與 storage 檔，再刪 row
  await supabase
    .from('rag_chunks')
    .delete()
    .eq('source_type', 'manual')
    .eq('source_id', id)
    .eq('brand_id', brandId);
  if (row.storage_path) {
    await supabase.storage.from(BUCKET).remove([row.storage_path as string]);
  }
  const { error: delErr } = await supabase
    .from('manuals')
    .delete()
    .eq('id', id)
    .eq('brand_id', brandId);
  if (delErr) return { ok: false, error: `刪除失敗：${delErr.message}` };

  revalidatePath('/admin/manuals');
  return { ok: true, data: { id } };
}

export async function reindexManual(id: string): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  // 重設狀態 + 清 chunks
  await supabase
    .from('rag_chunks')
    .delete()
    .eq('source_type', 'manual')
    .eq('source_id', id)
    .eq('brand_id', brandId);
  await supabase
    .from('manuals')
    .update({
      status: 'pending',
      total_chunks: 0,
      error_message: null,
      ingested_at: null,
    })
    .eq('id', id)
    .eq('brand_id', brandId);

  after(async () => {
    await runIngest(id);
  });

  revalidatePath('/admin/manuals');
  return { ok: true, data: { id } };
}

// ─── 背景 ingestion ────────────────────────────────────────

async function runIngest(manualId: string): Promise<void> {
  const supabase = await createClient();
  const { data: m } = await supabase
    .from('manuals')
    .select('id, brand_id, title, storage_path, mime_type, vehicle_model_ids')
    .eq('id', manualId)
    .maybeSingle();
  if (!m) return;

  await supabase
    .from('manuals')
    .update({ status: 'processing', error_message: null })
    .eq('id', manualId);

  try {
    // 下載 PDF
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(m.storage_path as string);
    if (dlErr || !blob) throw new Error(`下載失敗：${dlErr?.message}`);
    const buffer = Buffer.from(await blob.arrayBuffer());

    // 抽文字（PDF / DOCX / TXT 統一介面）
    const { text, pageCount, pages } = await extractDocText(
      buffer,
      m.mime_type as string,
    );

    // 切塊：先依頁切（每頁可能含多 chunk）—保留 page metadata
    const allChunks: { content: string; page: number | null }[] = [];
    if (pages.length > 0) {
      for (const p of pages) {
        if (!p.text.trim()) continue;
        for (const c of chunkText(p.text)) {
          allChunks.push({ content: c, page: p.pageNumber });
        }
      }
    } else {
      // fallback：純整段切
      for (const c of chunkText(text)) {
        allChunks.push({ content: c, page: null });
      }
    }

    if (allChunks.length === 0) throw new Error('chunking 後沒任何內容');

    // 批量 embed
    const vecs = await embedBatch(allChunks.map((c) => c.content));

    // upsert
    const rows = allChunks.map((c, idx) => ({
      brand_id: m.brand_id,
      source_type: 'manual',
      source_id: manualId,
      chunk_index: idx,
      content: c.content,
      embedding: toPgVector(vecs[idx]),
      metadata: {
        title: m.title,
        page: c.page,
        vehicle_model_ids: (m.vehicle_model_ids as string[] | null) ?? [],
      },
      embedding_model: EMBEDDING_MODEL,
      updated_at: new Date().toISOString(),
    }));
    const { error: upErr } = await supabase
      .from('rag_chunks')
      .upsert(rows, { onConflict: 'source_type,source_id,chunk_index' });
    if (upErr) throw new Error(`upsert chunks 失敗：${upErr.message}`);

    await supabase
      .from('manuals')
      .update({
        status: 'ready',
        page_count: pageCount,
        total_chunks: allChunks.length,
        ingested_at: new Date().toISOString(),
      })
      .eq('id', manualId);
  } catch (e) {
    const msg = (e as Error).message;
    await supabase
      .from('manuals')
      .update({ status: 'failed', error_message: msg })
      .eq('id', manualId);
    console.error(`[manual ${manualId}] ingest 失敗：${msg}`);
  }
}

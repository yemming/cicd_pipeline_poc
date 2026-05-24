'use server';

/**
 * RAG ingestion — 把 brand 內的紀錄類資料（不含手冊）serialize + embed + upsert
 * 到 rag_chunks。手冊有自己的 ingestion（src/domain/manuals.ts ingestManual）。
 *
 * 兩支 API：
 *   ingestRecord(sourceType, sourceId)   單筆（給 admin UI 觸發 / 自動 hook）
 *   reindexAllRecords()                  全部跑一遍（admin UI「重建紀錄索引」按鈕）
 */

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getActiveScope } from '@/lib/scope/active-scope';
import { requirePermission } from '@/lib/rbac/policies';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { embedBatch, EMBEDDING_MODEL, toPgVector } from '@/lib/ai/embeddings';
import {
  INGESTABLE_SOURCES,
  getIngestable,
} from '@/lib/ai/rag-registry.server';
import type { SerializedChunk } from '@/lib/ai/rag-serialize';

/** RAG source type — 自由字串、實際清單見 `INGESTABLE_SOURCES` registry */
export type RagSourceType = string;

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ─── 單筆 ingest ────────────────────────────────────────────

/**
 * 公開版：admin UI 用、有 permission check。
 * 給「重建單筆索引」按鈕、debug tool 之類的場景。
 */
export async function ingestRecord(
  sourceType: RagSourceType,
  sourceId: string,
): Promise<Result<{ chunks: number }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  return ingestRecordInternal(sourceType, sourceId);
}

/**
 * 內部版：給其他 server action 結尾 after(() => ingestRecordInternal(...)) 用。
 * 不檢 permission（呼叫端已檢過）、不阻擋主流程、失敗只 console.warn。
 */
export async function ingestRecordInternal(
  sourceType: RagSourceType,
  sourceId: string,
): Promise<Result<{ chunks: number }>> {
  try {
    const supabase = await createClient();
    const { brand_id: brandId } = await getActiveScope();

    const serialized = await serializeOne(sourceType, sourceId);
    if (!serialized) {
      console.warn(`[rag-ingest] 找不到 ${sourceType}/${sourceId}`);
      return { ok: false, error: `找不到 ${sourceType}/${sourceId}` };
    }

    const [vec] = await embedBatch([serialized.content]);
    const { error } = await supabase.from('rag_chunks').upsert(
      {
        brand_id: brandId,
        source_type: sourceType,
        source_id: sourceId,
        chunk_index: 0,
        content: serialized.content,
        embedding: toPgVector(vec),
        metadata: serialized.metadata,
        embedding_model: EMBEDDING_MODEL,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'source_type,source_id,chunk_index' },
    );
    if (error) {
      console.warn(`[rag-ingest] 寫 rag_chunks 失敗 ${sourceType}/${sourceId}: ${error.message}`);
      return { ok: false, error: error.message };
    }
    return { ok: true, data: { chunks: 1 } };
  } catch (e) {
    console.warn(`[rag-ingest] ${sourceType}/${sourceId} 失敗: ${(e as Error).message}`);
    return { ok: false, error: (e as Error).message };
  }
}

// ─── 全 brand reindex ────────────────────────────────────────

export type ReindexProgress = {
  source_type: RagSourceType;
  total: number;
  succeeded: number;
  failed: number;
};

/** 給 server action delete 時用：清掉對應 rag_chunks。失敗不阻擋。 */
export async function removeFromRag(
  sourceType: string,
  sourceId: string,
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase
      .from('rag_chunks')
      .delete()
      .eq('source_type', sourceType)
      .eq('source_id', sourceId);
  } catch (e) {
    console.warn(
      `[rag-ingest] cleanup ${sourceType}/${sourceId} 失敗: ${(e as Error).message}`,
    );
  }
}

/** 跑單一 source 的 reindex —— 給 client 一個個 call、顯示進度用 */
export async function reindexSource(
  sourceType: string,
): Promise<Result<ReindexProgress>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const src = getIngestable(sourceType);
  if (!src) {
    return { ok: false, error: `未知 source: ${sourceType}` };
  }
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const { data: rows, error } = await supabase
    .from(src.table)
    .select('id')
    .eq('brand_id', brandId);
  if (error) {
    return { ok: false, error: `撈 ${src.table} 失敗：${error.message}` };
  }
  const ids = (rows ?? []).map((r) => r.id as string);
  const total = ids.length;
  let succeeded = 0;
  let failed = 0;

  const BATCH = 50;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const serialized: { id: string; data: SerializedChunk }[] = [];
    const results = await Promise.all(slice.map((id) => serializeOne(sourceType, id)));
    for (let k = 0; k < results.length; k++) {
      const r = results[k];
      if (r) serialized.push({ id: slice[k], data: r });
      else failed++;
    }
    if (serialized.length === 0) continue;

    try {
      const vecs = await embedBatch(serialized.map((s) => s.data.content));
      const upsertRows = serialized.map((s, idx) => ({
        brand_id: brandId,
        source_type: sourceType,
        source_id: s.id,
        chunk_index: 0,
        content: s.data.content,
        embedding: toPgVector(vecs[idx]),
        metadata: s.data.metadata,
        embedding_model: EMBEDDING_MODEL,
        updated_at: new Date().toISOString(),
      }));
      const { error: upsertErr } = await supabase
        .from('rag_chunks')
        .upsert(upsertRows, { onConflict: 'source_type,source_id,chunk_index' });
      if (upsertErr) {
        failed += serialized.length;
      } else {
        succeeded += serialized.length;
      }
    } catch {
      failed += serialized.length;
    }
  }

  return { ok: true, data: { source_type: sourceType, total, succeeded, failed } };
}

/** 一次全跑（背景 / 不需要進度的場景） */
export async function reindexAllRecords(): Promise<Result<ReindexProgress[]>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const out: ReindexProgress[] = [];
  for (const { type } of INGESTABLE_SOURCES) {
    const r = await reindexSource(type);
    if (r.ok) out.push(r.data);
    else out.push({ source_type: type, total: 0, succeeded: 0, failed: 0 });
  }
  return { ok: true, data: out };
}

// ─── 內部 dispatch ──────────────────────────────────────────

async function serializeOne(
  type: RagSourceType,
  id: string,
): Promise<SerializedChunk | null> {
  const supabase = await createClient();
  const src = getIngestable(type);
  if (!src) return null;
  return src.serialize(supabase, id);
}

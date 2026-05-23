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
  serializeRepairOrder,
  serializeFinalInspection,
  serializeCustomer,
  serializeHandcardVoiceNote,
  serializeBusinessCardScan,
  type SerializedChunk,
} from '@/lib/ai/rag-serialize';

export type RagSourceType =
  | 'repair_order'
  | 'final_inspection'
  | 'customer'
  | 'handcard_voice'
  | 'business_card';

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ─── 單筆 ingest ────────────────────────────────────────────

export async function ingestRecord(
  sourceType: RagSourceType,
  sourceId: string,
): Promise<Result<{ chunks: number }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const serialized = await serializeOne(sourceType, sourceId);
  if (!serialized) return { ok: false, error: `找不到 ${sourceType}/${sourceId}` };

  try {
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
    if (error) return { ok: false, error: `寫 rag_chunks 失敗：${error.message}` };
    return { ok: true, data: { chunks: 1 } };
  } catch (e) {
    return { ok: false, error: `ingest 失敗：${(e as Error).message}` };
  }
}

// ─── 全 brand reindex ────────────────────────────────────────

export type ReindexProgress = {
  source_type: RagSourceType;
  total: number;
  succeeded: number;
  failed: number;
};

export async function reindexAllRecords(): Promise<Result<ReindexProgress[]>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const sources: { type: RagSourceType; table: string }[] = [
    { type: 'repair_order', table: 'repair_orders' },
    { type: 'final_inspection', table: 'final_inspections' },
    { type: 'customer', table: 'customers' },
    { type: 'handcard_voice', table: 'handcard_voice_notes' },
    { type: 'business_card', table: 'business_card_scans' },
  ];

  const out: ReindexProgress[] = [];

  for (const { type, table } of sources) {
    const { data: rows, error } = await supabase
      .from(table)
      .select('id')
      .eq('brand_id', brandId);
    if (error) {
      out.push({ source_type: type, total: 0, succeeded: 0, failed: 0 });
      continue;
    }
    const ids = (rows ?? []).map((r) => r.id as string);
    const total = ids.length;
    let succeeded = 0;
    let failed = 0;

    // 一次最多 100（embed batch 上限）
    const BATCH = 50;
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      const serialized: { id: string; data: SerializedChunk }[] = [];
      // 平行 serialize（讀取）
      const results = await Promise.all(slice.map((id) => serializeOne(type, id)));
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
          source_type: type,
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

    out.push({ source_type: type, total, succeeded, failed });
  }

  return { ok: true, data: out };
}

// ─── 內部 dispatch ──────────────────────────────────────────

async function serializeOne(
  type: RagSourceType,
  id: string,
): Promise<SerializedChunk | null> {
  const supabase = await createClient();
  switch (type) {
    case 'repair_order':
      return serializeRepairOrder(supabase, id);
    case 'final_inspection':
      return serializeFinalInspection(supabase, id);
    case 'customer':
      return serializeCustomer(supabase, id);
    case 'handcard_voice':
      return serializeHandcardVoiceNote(supabase, id);
    case 'business_card':
      return serializeBusinessCardScan(supabase, id);
  }
}

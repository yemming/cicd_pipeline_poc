/**
 * RAG retrieval — query embedding + pgvector top-K + brand/source filter
 *
 * 用 cosine similarity（pgvector `<=>` operator）。HNSW index 已建。
 * 回 chunk content + metadata + similarity score 給 caller 組 LLM prompt 用。
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { embedText, toPgVector } from '@/lib/ai/embeddings';

export type RagSourceType =
  | 'manual'
  | 'repair_order'
  | 'final_inspection'
  | 'customer'
  | 'handcard_voice'
  | 'business_card';

export type RetrievedChunk = {
  chunkId: string;
  sourceType: RagSourceType;
  sourceId: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

export type RetrieveOptions = {
  brandId: string;
  sourceTypes?: RagSourceType[];
  topK?: number;
  /** 限定客戶 id（會比對 metadata->>'customer_id'） */
  customerId?: string;
};

export async function retrieveContext(
  supabase: SupabaseClient,
  query: string,
  options: RetrieveOptions,
): Promise<RetrievedChunk[]> {
  if (!query.trim()) return [];
  const topK = options.topK ?? 8;

  // query 端用 RETRIEVAL_QUERY、與 ingestion 的 RETRIEVAL_DOCUMENT 對稱
  const queryEmbedding = await embedText(query, 'RETRIEVAL_QUERY');
  const qVec = toPgVector(queryEmbedding);

  // pgvector ORDER BY 走 RPC（match_rag_chunks），避免在 client 拼 SQL
  const { data, error } = await supabase.rpc('match_rag_chunks', {
    query_embedding: qVec,
    p_brand_id: options.brandId,
    p_source_types: options.sourceTypes ?? null,
    p_customer_id: options.customerId ?? null,
    p_top_k: topK,
  });

  if (error) {
    throw new Error(`retrieveContext RPC 失敗：${error.message}`);
  }

  const primary = ((data ?? []) as Array<{
    id: string;
    source_type: string;
    source_id: string;
    chunk_index: number;
    content: string;
    metadata: Record<string, unknown> | null;
    similarity: number;
  }>).map((r) => ({
    chunkId: r.id,
    sourceType: r.source_type as RagSourceType,
    sourceId: r.source_id,
    chunkIndex: r.chunk_index,
    content: r.content,
    metadata: r.metadata ?? {},
    similarity: r.similarity,
  }));

  // ─── Hybrid 二次撈：把同 customer_id 的相關 chunks 拉進來 ─────
  // 例：top-1 是 customer 孫燕姿、就把她的工單 / 接待錄音 / 名片 / 檢驗
  // 一起拉進 context，解決「entity 沒打通」的問題
  return augmentWithRelatedChunks(supabase, primary, options.brandId);
}

async function augmentWithRelatedChunks(
  supabase: SupabaseClient,
  primary: RetrievedChunk[],
  brandId: string,
): Promise<RetrievedChunk[]> {
  const customerIds = new Set<string>();
  for (const c of primary) {
    const cid = (c.metadata.customer_id as string | undefined) ?? undefined;
    if (cid) customerIds.add(cid);
    if (c.sourceType === 'customer') customerIds.add(c.sourceId);
  }
  if (customerIds.size === 0) return primary;

  // 撈所有「同 customer_id」或「source_id 是某個 customer」的 chunks
  // .or() 接逗號分隔的條件、有空格要避免、UUID 不含特殊字元直接拼即可
  const ors: string[] = [];
  for (const id of customerIds) {
    ors.push(`metadata->>customer_id.eq.${id}`);
    ors.push(`source_id.eq.${id}`);
  }

  const { data: related, error } = await supabase
    .from('rag_chunks')
    .select('id, source_type, source_id, chunk_index, content, metadata')
    .eq('brand_id', brandId)
    .or(ors.join(','))
    .limit(20);

  if (error || !related) return primary;

  const seen = new Set(primary.map((c) => c.chunkId));
  const extras: RetrievedChunk[] = [];
  for (const r of related) {
    if (seen.has(r.id as string)) continue;
    extras.push({
      chunkId: r.id as string,
      sourceType: r.source_type as RagSourceType,
      sourceId: r.source_id as string,
      chunkIndex: r.chunk_index as number,
      content: r.content as string,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      similarity: 0.5, // hybrid baseline（非 vector 比對、但跟主題客戶相關）
    });
  }
  return [...primary, ...extras];
}

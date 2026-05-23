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

  return ((data ?? []) as Array<{
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
}

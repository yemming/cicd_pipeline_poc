import { createClient as createSbClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-side service role client — 繞過 RLS，用於內部流程
// （dispatch / scheduled task / webhook handler 等，行為者不是「人」）
//
// ⚠️ 只能從 server 環境呼叫。絕對不可出現在 client component。

let cached: SupabaseClient | null = null;

export function createServiceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL 未設定");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY 或 SUPABASE_SECRET_KEY 未設定");

  cached = createSbClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  SEARCH_REGISTRY,
  GLOBAL_SEARCH_LIMITS,
  type GlobalSearchHit,
  type SearchTableSpec,
} from "@/lib/search/global-search-registry";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;
export const dynamic = "force-dynamic";

export type { GlobalSearchHit };

// 把 user input 清掉會打壞 PostgREST .or() parser 的字元(逗號、括號)
function sanitizeForOr(q: string): string {
  return q.replace(/[,()]/g, " ").trim();
}

function buildOrExpr(fields: string[], q: string): string {
  return fields.map((f) => `${f}.ilike.%${q}%`).join(",");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQ = (searchParams.get("q") ?? "").trim();
  const q = sanitizeForOr(rawQ);

  // 太短直接 short-circuit — 1 個字元 ilike 太多沒意義
  if (q.length < 2) {
    return NextResponse.json({ hits: [] satisfies GlobalSearchHit[] });
  }

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 平行打所有表 — Promise.allSettled 確保任何一張表壞掉不影響其他
  const results = await Promise.allSettled(
    SEARCH_REGISTRY.map((spec) => runOne(supabase, spec, brand, q)),
  );

  const allHits: GlobalSearchHit[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") allHits.push(...r.value);
  }

  // 排序:updated_at desc(最近異動的優先), nullable 排後面
  allHits.sort((a, b) => {
    const at = a.updated_at ?? "";
    const bt = b.updated_at ?? "";
    if (at === bt) return 0;
    return at < bt ? 1 : -1;
  });

  return NextResponse.json({ hits: allHits.slice(0, GLOBAL_SEARCH_LIMITS.total) });
}

async function runOne(
  supabase: ServerSupabase,
  spec: SearchTableSpec,
  brand: string,
  q: string,
): Promise<GlobalSearchHit[]> {
  const orExpr = buildOrExpr(spec.searchFields, q);
  const { data, error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from(spec.table as any)
    .select(spec.selectColumns)
    .eq("brand_id", brand)
    .or(orExpr)
    .order(spec.sortColumn ?? "updated_at", { ascending: false })
    .limit(GLOBAL_SEARCH_LIMITS.perTable);

  if (error) {
    // 個別表壞掉就 swallow — log 在 server 端、不要讓單一表掛掉整個搜尋
    console.error(`[global-search] table=${spec.table} error:`, error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows
    .map((row) => spec.toHit(row))
    .filter((h): h is GlobalSearchHit => h !== null);
}

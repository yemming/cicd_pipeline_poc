import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
export const dynamic = "force-dynamic";

export type GlobalSearchHit = {
  entity_type: string;
  entity_id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  // 太短直接 short-circuit — 1 個字元 trigram match 太多沒意義
  if (q.length < 2) {
    return NextResponse.json({ hits: [] satisfies GlobalSearchHit[] });
  }

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // RLS 已經靠 user_has_brand() 把跨 brand 擋掉，這裡再 eq("brand_id") 一次當保險（也讓 query plan 走 brand_type index）
  const { data, error } = await supabase
    .from("global_search_index")
    .select("entity_type, entity_id, title, subtitle, href")
    .eq("brand_id", brand)
    .ilike("keywords", `%${q}%`)
    .order("updated_at", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: error.message, hits: [] }, { status: 500 });
  }

  return NextResponse.json({ hits: (data ?? []) as GlobalSearchHit[] });
}

"use client";

import { useEffect, useState } from "react";
import type { GlobalSearchHit } from "@/app/api/global-search/route";

// 共用 hook：給 query → 回 debounced 的 DB 搜尋結果。
// query.trim() 長度 < 2 一律回空 + 不打 API。
export function useGlobalSearch(query: string, enabled: boolean = true) {
  const [hits, setHits] = useState<GlobalSearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHits([]);
      setLoading(false);
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/global-search?q=${encodeURIComponent(q)}`);
        const json = (await res.json()) as { hits?: GlobalSearchHit[] };
        setHits(json.hits ?? []);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, enabled]);

  return { hits, loading };
}

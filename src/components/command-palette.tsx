"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNav } from "./nav-provider";
import { useGlobalSearch } from "@/lib/search/use-global-search";
import { entityMeta } from "@/lib/search/entity-meta";
import type { GlobalSearchHit } from "@/app/api/global-search/route";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

type FlatRow =
  | { kind: "page"; href: string; name: string; moduleName: string; sprint?: string; icon?: string; accent?: string }
  | { kind: "db"; href: string; entity_type: string; entity_id: string; title: string; subtitle: string | null };

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { allPages } = useNav();

  const items = useMemo(() => allPages(), [allPages]);

  // 頁面結果（同舊行為）
  const pageHits = useMemo(() => {
    if (!query) return items.slice(0, 8);
    const q = query.toLowerCase();
    return items
      .filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.moduleName.toLowerCase().includes(q) ||
          (item.sprint ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, items]);

  // DB 搜尋走共用 hook（只在 overlay 開啟時生效）
  const { hits: dbHits, loading: dbLoading } = useGlobalSearch(query, open);

  // 把所有結果攤平成一條 list 給鍵盤導航
  const flat = useMemo<FlatRow[]>(() => {
    const rows: FlatRow[] = [];
    for (const p of pageHits) {
      rows.push({
        kind: "page",
        href: p.href,
        name: p.name,
        moduleName: p.moduleName,
        sprint: p.sprint,
        icon: p.icon,
        accent: p.accent,
      });
    }
    for (const h of dbHits) {
      rows.push({
        kind: "db",
        href: h.href,
        entity_type: h.entity_type,
        entity_id: h.entity_id,
        title: h.title,
        subtitle: h.subtitle,
      });
    }
    return rows;
  }, [pageHits, dbHits]);

  // 分組顯示（DB 結果按 entity_type 分組）
  const groupedDb = useMemo(() => {
    const groups = new Map<string, GlobalSearchHit[]>();
    for (const h of dbHits) {
      const arr = groups.get(h.entity_type) ?? [];
      arr.push(h);
      groups.set(h.entity_type, arr);
    }
    return groups;
  }, [dbHits]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flat[selectedIndex]) {
      e.preventDefault();
      router.push(flat[selectedIndex].href);
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  // selectedIndex 邊界守護
  useEffect(() => {
    if (selectedIndex >= flat.length) setSelectedIndex(Math.max(0, flat.length - 1));
  }, [flat.length, selectedIndex]);

  if (!open) return null;

  // 全域 row index，用來決定 highlight
  let rowCursor = 0;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-primary/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative max-w-xl w-full mx-auto mt-[12vh] px-4">
        <div className="bg-surface-container-lowest rounded-2xl shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-container-high">
            <span className="material-symbols-outlined text-xl text-outline">
              search
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="搜尋客戶、訂單、發票、車輛、頁面..."
              className="flex-1 bg-transparent text-on-surface text-sm placeholder:text-outline outline-none"
            />
            {dbLoading ? (
              <span className="material-symbols-outlined text-base text-outline animate-spin">progress_activity</span>
            ) : null}
            <kbd className="px-2 py-0.5 bg-surface-container rounded text-xs text-outline font-mono">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {flat.length === 0 ? (
              <p className="text-center text-sm text-outline py-8">
                {query.trim().length < 2 ? "輸入 2 個字以上開始搜尋" : "找不到符合的結果"}
              </p>
            ) : (
              <>
                {/* 頁面分組 */}
                {pageHits.length > 0 && (
                  <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-outline">
                    功能頁面
                  </div>
                )}
                {pageHits.map((item) => {
                  const myIndex = rowCursor++;
                  const selected = myIndex === selectedIndex;
                  return (
                    <button
                      key={`page-${item.href}`}
                      onClick={() => {
                        router.push(item.href);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(myIndex)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-colors ${
                        selected
                          ? "bg-surface-container text-on-surface"
                          : "text-on-surface-variant hover:bg-surface-container-low"
                      }`}
                    >
                      <span
                        className="material-symbols-outlined text-lg shrink-0"
                        style={{ color: item.accent }}
                      >
                        {item.icon ?? "link"}
                      </span>
                      <span className="flex-1 text-left font-medium truncate">{item.name}</span>
                      {item.sprint && item.sprint !== "—" && (
                        <span className="text-[10px] font-mono text-outline">{item.sprint}</span>
                      )}
                      <span className="text-xs text-outline shrink-0">{item.moduleName}</span>
                    </button>
                  );
                })}

                {/* DB 結果分組（按 entity_type 排序顯示） */}
                {Array.from(groupedDb.entries()).map(([entityType, hits]) => {
                  const meta = entityMeta(entityType);
                  return (
                    <div key={`group-${entityType}`}>
                      <div className="px-2 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-outline flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[12px]" style={{ color: meta.color }}>
                          {meta.icon}
                        </span>
                        {meta.label}
                        <span className="text-outline font-normal">· {hits.length}</span>
                      </div>
                      {hits.map((hit) => {
                        const myIndex = rowCursor++;
                        const selected = myIndex === selectedIndex;
                        return (
                          <button
                            key={`db-${hit.entity_type}-${hit.entity_id}`}
                            onClick={() => {
                              router.push(hit.href);
                              onClose();
                            }}
                            onMouseEnter={() => setSelectedIndex(myIndex)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-colors ${
                              selected
                                ? "bg-surface-container text-on-surface"
                                : "text-on-surface-variant hover:bg-surface-container-low"
                            }`}
                          >
                            <span
                              className="material-symbols-outlined text-lg shrink-0"
                              style={{ color: meta.color }}
                            >
                              {meta.icon}
                            </span>
                            <span className="flex-1 text-left min-w-0">
                              <div className="font-medium truncate">{hit.title || "(無標題)"}</div>
                              {hit.subtitle ? (
                                <div className="text-[11px] text-outline truncate font-mono">{hit.subtitle}</div>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Footer hints */}
          <div className="flex items-center gap-4 px-5 py-3 border-t border-surface-container-high text-xs text-outline">
            <span>↑↓ 導航</span>
            <span>↵ 選取</span>
            <span>ESC 關閉</span>
            <span className="ml-auto">
              {pageHits.length} 頁面 · {dbHits.length} 資料
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

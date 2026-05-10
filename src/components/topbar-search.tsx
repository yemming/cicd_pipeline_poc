"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useGlobalSearch } from "@/lib/search/use-global-search";
import { entityMeta } from "@/lib/search/entity-meta";

interface TopbarSearchProps {
  placeholder?: string;
  /** ⌘ + K shortcut hint — only rendered when there's space (lg+) */
  showShortcut?: boolean;
}

/**
 * 顶部 inline 搜尋：點 input 直接輸入、結果以 dropdown 浮在 input 下方。
 * 不再彈 overlay。Overlay 留給右側放大鏡 icon / ⌘K 觸發。
 */
export function TopbarSearch({ placeholder = "搜尋客戶、訂單、車輛...", showShortcut = true }: TopbarSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // dropdown 只在 input 有 focus 且使用者打了字的時候才顯示
  const { hits, loading } = useGlobalSearch(query, open);

  // 點擊 outside 收合
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // 按 entity_type 分組
  const grouped = useMemo(() => {
    const m = new Map<string, typeof hits>();
    for (const h of hits) {
      const arr = m.get(h.entity_type) ?? [];
      arr.push(h);
      m.set(h.entity_type, arr);
    }
    return m;
  }, [hits]);

  // selectedIndex 邊界守護
  useEffect(() => {
    if (selectedIndex >= hits.length) setSelectedIndex(Math.max(0, hits.length - 1));
  }, [hits.length, selectedIndex]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && hits[selectedIndex]) {
      e.preventDefault();
      router.push(hits[selectedIndex].href);
      closeAndReset();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeAndReset();
      inputRef.current?.blur();
    }
  }

  function closeAndReset() {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={wrapperRef} className="relative w-full">
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-white/50 text-lg pointer-events-none">
        search
      </span>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedIndex(0);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        type="text"
        className="w-full pl-10 pr-3 lg:pr-16 py-2 bg-white/10 border border-white/10 rounded-full text-sm text-white placeholder-white/50 focus:ring-1 focus:ring-white/40 focus:bg-white/15 transition-all outline-none"
      />
      {showShortcut && !open && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:flex gap-1 pointer-events-none">
          <kbd className="px-1.5 py-0.5 rounded border border-white/20 text-[10px] text-white/60 font-sans">⌘</kbd>
          <kbd className="px-1.5 py-0.5 rounded border border-white/20 text-[10px] text-white/60 font-sans">K</kbd>
        </div>
      )}
      {loading && open && (
        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-white/60 text-base animate-spin">
          progress_activity
        </span>
      )}

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-2xl border border-[#EEECE6] overflow-hidden z-[80]">
          {hits.length === 0 ? (
            <p className="text-center text-[12.5px] text-[#9A9890] py-6">
              {loading ? "搜尋中..." : "找不到符合的結果"}
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto py-1.5">
              {(() => {
                let cursor = 0;
                return Array.from(grouped.entries()).map(([type, group]) => {
                  const meta = entityMeta(type);
                  return (
                    <div key={type}>
                      <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#9A9890] flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[12px]" style={{ color: meta.color }}>
                          {meta.icon}
                        </span>
                        {meta.label}
                        <span className="font-normal text-[#9A9890]">· {group.length}</span>
                      </div>
                      {group.map((hit) => {
                        const myIndex = cursor++;
                        const isSelected = myIndex === selectedIndex;
                        return (
                          <button
                            key={`${hit.entity_type}-${hit.entity_id}`}
                            onMouseDown={(e) => {
                              // mousedown 在 click 之前；不用 onClick 避免被 outside-click 收合搶先
                              e.preventDefault();
                              router.push(hit.href);
                              closeAndReset();
                            }}
                            onMouseEnter={() => setSelectedIndex(myIndex)}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                              isSelected ? "bg-[#F8F7F4]" : "hover:bg-[#FBFAF7]"
                            }`}
                          >
                            <span className="material-symbols-outlined text-[18px] shrink-0" style={{ color: meta.color }}>
                              {meta.icon}
                            </span>
                            <span className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium text-[#2C2C2A] truncate">{hit.title || "(無標題)"}</div>
                              {hit.subtitle ? (
                                <div className="text-[11px] text-[#9A9890] truncate font-mono">{hit.subtitle}</div>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                });
              })()}
            </div>
          )}
          <div className="flex items-center gap-3 px-3 py-2 border-t border-[#EEECE6] text-[10.5px] text-[#9A9890] bg-[#F8F7F4]">
            <span>↑↓ 選取</span>
            <span>↵ 開啟</span>
            <span>ESC 關閉</span>
            <span className="ml-auto">{hits.length} 筆</span>
          </div>
        </div>
      )}
    </div>
  );
}

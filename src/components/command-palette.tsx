"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { allPages } from "@/lib/modules";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const items = useMemo(() => allPages(), []);

  const filtered = query
    ? items.filter((item) => {
        const q = query.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.moduleName.toLowerCase().includes(q) ||
          (item.sprint ?? "").toLowerCase().includes(q)
        );
      })
    : items.slice(0, 30);

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
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      router.push(filtered[selectedIndex].href);
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  if (!open) return null;

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
              placeholder="搜尋功能、頁面、Sprint 編號..."
              className="flex-1 bg-transparent text-on-surface text-sm placeholder:text-outline outline-none"
            />
            <kbd className="px-2 py-0.5 bg-surface-container rounded text-xs text-outline font-mono">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-outline py-8">
                找不到符合的結果
              </p>
            ) : (
              filtered.map((item, i) => (
                <button
                  key={item.href}
                  onClick={() => {
                    router.push(item.href);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-colors ${
                    i === selectedIndex
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
                  <span className="flex-1 text-left font-medium truncate">
                    {item.name}
                  </span>
                  {item.sprint && item.sprint !== "—" && (
                    <span className="text-[10px] font-mono text-outline">
                      {item.sprint}
                    </span>
                  )}
                  <span className="text-xs text-outline shrink-0">
                    {item.moduleName}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Footer hints */}
          <div className="flex items-center gap-4 px-5 py-3 border-t border-surface-container-high text-xs text-outline">
            <span>↑↓ 導航</span>
            <span>↵ 選取</span>
            <span>ESC 關閉</span>
            <span className="ml-auto">{filtered.length} / {items.length} 個頁面</span>
          </div>
        </div>
      </div>
    </div>
  );
}

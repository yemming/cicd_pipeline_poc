"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const searchItems = [
  { label: "展廳看板", icon: "dashboard", href: "/showroom", group: "銷售管理" },
  { label: "電子手卡", icon: "description", href: "/showroom/cards", group: "銷售管理" },
  { label: "線索管理", icon: "search", href: "/leads", group: "銷售管理" },
  { label: "客戶中心", icon: "group", href: "/customers", group: "銷售管理" },
  { label: "訂單中心", icon: "assignment", href: "/orders", group: "銷售管理" },
  { label: "金融服務", icon: "payments", href: "/orders/finance", group: "交易服務" },
  { label: "保險服務", icon: "verified_user", href: "/orders/insurance", group: "交易服務" },
  { label: "精品管理", icon: "featured_video", href: "/orders/accessories", group: "交易服務" },
  { label: "預約管理", icon: "calendar_today", href: "/aftersales", group: "售後服務" },
  { label: "維修工單", icon: "build", href: "/aftersales/workorders", group: "售後服務" },
  { label: "組織權限", icon: "admin_panel_settings", href: "/dealer", group: "營運管理" },
  { label: "審批中心", icon: "fact_check", href: "/dealer/approvals", group: "營運管理" },
  { label: "報表中心", icon: "bar_chart", href: "/reports", group: "營運管理" },
  { label: "系統設定", icon: "settings", href: "/settings", group: "營運管理" },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filtered = query
    ? searchItems.filter(
        (item) =>
          item.label.includes(query) || item.group.includes(query)
      )
    : searchItems;

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) {
          onClose();
        }
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
      <div className="relative max-w-lg w-full mx-auto mt-[15vh]">
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
              placeholder="搜尋功能、頁面..."
              className="flex-1 bg-transparent text-on-surface text-sm placeholder:text-outline outline-none"
            />
            <kbd className="px-2 py-0.5 bg-surface-container rounded text-xs text-outline font-mono">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto p-2">
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
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
                    i === selectedIndex
                      ? "bg-surface-container text-on-surface"
                      : "text-on-surface-variant hover:bg-surface-container-low"
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">
                    {item.icon}
                  </span>
                  <span className="flex-1 text-left font-medium">
                    {item.label}
                  </span>
                  <span className="text-xs text-outline">{item.group}</span>
                </button>
              ))
            )}
          </div>

          {/* Footer hints */}
          <div className="flex items-center gap-4 px-5 py-3 border-t border-surface-container-high text-xs text-outline">
            <span>↑↓ 導航</span>
            <span>↵ 選取</span>
            <span>ESC 關閉</span>
          </div>
        </div>
      </div>
    </div>
  );
}

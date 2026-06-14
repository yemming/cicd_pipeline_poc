"use client";

/**
 * RP8 今日待辦清單 — TodoBadge 元件
 *
 * 特性：
 *   - 每 60s 輪詢 GET /api/my-todos
 *   - 點擊 icon → dropdown 清單（最多 50 筆，依優先級排序）
 *   - 項目有數量 badge（紅色，> 9 顯示 9+）
 *   - 點擊項目 → 跳轉對應頁
 *   - 點外部 → 關閉 dropdown
 *
 * 優先級色票：
 *   red    = #CC0000（緊急，退回重工 / 待核准）
 *   orange = #854F0B（一般，待料 / 待結帳）
 *   grey   = #6B6A68（低優先）
 */

import { useCallback, useEffect, useRef, useState, startTransition } from "react";
import Link from "next/link";
import { type TodoItem } from "@/domain/my-todos.constants";

const POLL_INTERVAL_MS = 60_000; // 60 秒

const KIND_ICON: Record<string, string> = {
  pending_approval_decision: "gavel",
  pending_approval_requested: "hourglass_top",
  ro_rework: "build_circle",
  ro_parts_waiting: "inventory_2",
  ro_checkout_pending: "receipt_long",
  ro_inprogress: "handyman",
};

const KIND_LABEL: Record<string, string> = {
  pending_approval_decision: "待我核准",
  pending_approval_requested: "等待核准",
  ro_rework: "退回重工",
  ro_parts_waiting: "待料",
  ro_checkout_pending: "待結帳",
  ro_inprogress: "進行中",
};

const PRIORITY_DOT: Record<string, string> = {
  red: "bg-[#CC0000]",
  orange: "bg-[#854F0B]",
  grey: "bg-[#6B6A68]",
};

function relativeTime(isoStr?: string): string {
  if (!isoStr) return "";
  const diff = Date.now() - new Date(isoStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function TodoBadge() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const urgentCount = todos.filter((t) => t.priority === "red").length;
  const totalCount = todos.length;
  const badgeCount = urgentCount > 0 ? urgentCount : totalCount;

  // ── 輪詢 ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const run = () => {
      startTransition(() => {
        fetch("/api/my-todos", {
          cache: "no-store",
          credentials: "same-origin",
        })
          .then((res) => res.json() as Promise<{ ok: boolean; data: TodoItem[] }>)
          .then((json) => {
            if (!cancelled && json.ok) {
              setTodos(json.data ?? []);
            }
          })
          .catch(() => {});
      });
    };

    run();
    const timer = setInterval(run, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // ── 點外部關閉 ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const handleItemClick = useCallback(() => {
    setOpen(false);
  }, []);

  if (totalCount === 0 && !open) {
    // 沒有待辦時不顯示 badge icon（保持 topbar 整潔）
    // 仍渲染空 div 維持 hook 規則
    return <div ref={containerRef} />;
  }

  return (
    <div ref={containerRef} className="relative">
      {/* 待辦按鈕 */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="今日待辦"
        aria-label="今日待辦清單"
        className="relative p-1.5 md:p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all inline-flex items-center justify-center"
      >
        <span className="material-symbols-outlined text-[20px] md:text-[22px]">
          checklist
        </span>
        {badgeCount > 0 && (
          <span
            className={`absolute top-0.5 right-0.5 min-w-[16px] h-[16px] px-[3px]
              rounded-full text-white text-[9px] font-bold
              flex items-center justify-center leading-none
              ${urgentCount > 0 ? "bg-[#CC0000]" : "bg-[#854F0B]"}`}
          >
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] w-[360px] max-h-[520px]
            bg-white border border-[#EEECE6] rounded-lg shadow-xl z-[200]
            flex flex-col overflow-hidden"
          role="dialog"
          aria-label="今日待辦清單"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              今日待辦
              {totalCount > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold
                  ${urgentCount > 0 ? "bg-[#FDECEA] text-[#CC0000]" : "bg-[#FDF3E3] text-[#854F0B]"}`}>
                  {totalCount} 項
                </span>
              )}
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-[11px] text-[#9A9890] hover:text-[#5A5955]"
            >
              關閉
            </button>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {todos.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-[#9A9890]">
                <span className="material-symbols-outlined text-[36px] block mb-2 opacity-40">
                  task_alt
                </span>
                目前沒有待辦事項
              </div>
            ) : (
              <ul className="divide-y divide-[#EEECE6]">
                {todos.map((todo) => (
                  <TodoItem key={todo.id} todo={todo} onClose={handleItemClick} />
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-[#EEECE6] bg-[#F8F7F4] text-[10px] text-[#9A9890] text-center">
            每 60 秒自動更新 · 依角色自動過濾
          </div>
        </div>
      )}
    </div>
  );
}

// ── 單筆待辦列 ────────────────────────────────────────────────

function TodoItem({ todo, onClose }: { todo: TodoItem; onClose: () => void }) {
  const dotClass = PRIORITY_DOT[todo.priority] ?? PRIORITY_DOT.orange;
  const icon = KIND_ICON[todo.kind] ?? "task";
  const kindLabel = KIND_LABEL[todo.kind] ?? todo.kind;

  const inner = (
    <div
      className="px-3 py-2.5 flex gap-2.5 items-start cursor-pointer transition-colors
        hover:bg-[#F8F7F4] bg-white"
    >
      {/* 優先級色點 */}
      <div className="mt-1.5 shrink-0">
        <span className={`block w-2 h-2 rounded-full ${dotClass}`} />
      </div>
      {/* 種類 icon */}
      <div className="shrink-0 mt-0.5">
        <span className="material-symbols-outlined text-[16px] text-[#9A9890]">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#EAF4FB] text-[#185FA5] font-medium whitespace-nowrap">
            {kindLabel}
          </span>
          {todo.ro_code && (
            <span className="text-[10px] font-mono text-[#9A9890] truncate">{todo.ro_code}</span>
          )}
        </div>
        <p className="text-[12px] font-semibold text-[#2C2C2A] leading-snug truncate">
          {todo.title}
        </p>
        <p className="text-[11px] text-[#5A5955] mt-0.5 leading-snug line-clamp-2">
          {todo.body}
        </p>
        {todo.created_at && (
          <p className="text-[10px] text-[#9A9890] mt-1">{relativeTime(todo.created_at)}</p>
        )}
      </div>
    </div>
  );

  if (todo.href) {
    return (
      <li>
        <Link href={todo.href} onClick={onClose} className="block">
          {inner}
        </Link>
      </li>
    );
  }
  return <li>{inner}</li>;
}

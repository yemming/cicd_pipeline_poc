"use client";

/**
 * RP8 站內通知中心 — 鈴鐺元件（Realtime 升級版）
 *
 * 特性：
 *   - Supabase Realtime postgres_changes 訂閱 user_notifications（即時）
 *   - 30s 輪詢 fallback（Realtime 斷線時確保最終一致）
 *   - 紅色 badge 顯示未讀數（> 9 顯示 9+）
 *   - 點鈴鐺 → 彈出下拉清單，顯示最近 50 筆（未讀置頂）
 *   - 點單筆 → markRead + 若有 href 跳轉
 *   - 點「全部標已讀」→ markAllRead
 *
 * 優先級色票：
 *   red    = #CC0000（立即，如授權申請/費用爭議）
 *   orange = #854F0B（一般）
 *   grey   = #6B6A68（已處理/資訊）
 */

import { useCallback, useEffect, useRef, useState, startTransition } from "react";
import Link from "next/link";
import { type InappNotification } from "@/domain/user-notifications.constants";
import { subscribeUserNotifications } from "@/domain/user-notifications.realtime";

const POLL_INTERVAL_MS = 30_000; // 30 秒 fallback 輪詢

/** 格式化相對時間（最多顯示到幾天前）*/
function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 天前`;
}

const PRIORITY_DOT: Record<string, string> = {
  red: "bg-[#CC0000]",
  orange: "bg-[#854F0B]",
  grey: "bg-[#6B6A68]",
};

/** 判斷是否未讀 */
const isUnread = (n: InappNotification) => n.read_at === null;

export function NotificationBell() {
  const [notifications, setNotifications] = useState<InappNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(isUnread).length;

  // ── 從 API 拉取通知清單 ────────────────────────────────────
  const fetchNotifications = useCallback(() => {
    startTransition(() => {
      fetch("/api/inapp-notifications", {
        cache: "no-store",
        credentials: "same-origin",
      })
        .then((res) => res.json() as Promise<{ ok: boolean; data: InappNotification[] }>)
        .then((json) => {
          if (json.ok) {
            setNotifications(json.data);
          }
        })
        .catch(() => {
          // 靜默失敗，等下次輪詢或 Realtime 觸發再試
        });
    });
  }, []);

  // ── Supabase Realtime 訂閱 + 30s 輪詢 fallback ───────────
  useEffect(() => {
    let cancelled = false;
    let realtimeCleanup: (() => void) | null = null;

    // 初次載入
    fetchNotifications();

    // 30s 輪詢 fallback（Realtime 斷線時確保最終一致）
    const timer = setInterval(() => {
      if (!cancelled) fetchNotifications();
    }, POLL_INTERVAL_MS);

    // 取得 user_id 後啟動 Realtime 訂閱
    // 透過 API 取 user_id 避免 component 直接 import @/lib/supabase
    fetch("/api/inapp-notifications", { credentials: "same-origin", cache: "no-store" })
      .then((res) => res.json() as Promise<{ ok: boolean; data: InappNotification[]; user_id?: string }>)
      .then((json) => {
        if (!cancelled && json.user_id) {
          realtimeCleanup = subscribeUserNotifications(json.user_id, () => {
            if (!cancelled) fetchNotifications();
          });
        }
      })
      .catch(() => {
        // 靜默：Realtime 降級為純輪詢
      });

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (realtimeCleanup) realtimeCleanup();
    };
  }, [fetchNotifications]);

  // ── 點外部關閉 dropdown ────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // ── 標記單筆已讀 ──────────────────────────────────────────
  const handleRead = useCallback(
    async (id: string) => {
      // 樂觀更新：把 read_at 設為現在
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: now } : n)),
      );
      await fetch("/api/inapp-notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
        credentials: "same-origin",
      }).catch(() => {});
    },
    [],
  );

  // ── 全部已讀 ──────────────────────────────────────────────
  const handleMarkAllRead = useCallback(async () => {
    setLoading(true);
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? now })),
    );
    await fetch("/api/inapp-notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "all" }),
      credentials: "same-origin",
    }).catch(() => {});
    setLoading(false);
  }, []);

  // ── 排序：未讀置頂，同狀態按時間倒序 ──────────────────────
  const sorted = [...notifications].sort((a, b) => {
    const aUnread = isUnread(a);
    const bUnread = isUnread(b);
    if (aUnread !== bUnread) return aUnread ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div ref={containerRef} className="relative">
      {/* 鈴鐺按鈕 */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="通知中心"
        aria-label="通知中心"
        className="relative p-1.5 md:p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all inline-flex items-center justify-center"
      >
        <span className="material-symbols-outlined text-[20px] md:text-[22px]">
          notifications
        </span>
        {unreadCount > 0 && (
          <span
            className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] px-[3px]
              rounded-full bg-[#CC0000] text-white text-[9px] font-bold
              flex items-center justify-center leading-none"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] w-[340px] max-h-[480px]
            bg-white border border-[#EEECE6] rounded-lg shadow-xl z-[200]
            flex flex-col overflow-hidden"
          role="dialog"
          aria-label="通知中心"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              通知中心
              {unreadCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[#FDECEA] text-[#CC0000] text-[10px] font-bold">
                  {unreadCount} 則未讀
                </span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={loading}
                className="text-[11px] text-[#185FA5] hover:underline disabled:opacity-50"
              >
                全部已讀
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {sorted.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-[#9A9890]">
                <span className="material-symbols-outlined text-[36px] block mb-2 opacity-40">
                  notifications_none
                </span>
                目前沒有通知
              </div>
            ) : (
              <ul className="divide-y divide-[#EEECE6]">
                {sorted.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onRead={handleRead}
                    onClose={() => setOpen(false)}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 border-t border-[#EEECE6] bg-[#F8F7F4] text-[10px] text-[#9A9890] text-center">
            即時通知 · 30 秒輪詢備援
          </div>
        </div>
      )}
    </div>
  );
}

// ── 單筆通知列 ────────────────────────────────────────────────

function NotificationItem({
  notification: n,
  onRead,
  onClose,
}: {
  notification: InappNotification;
  onRead: (id: string) => void;
  onClose: () => void;
}) {
  const unread = isUnread(n);
  const dotClass =
    PRIORITY_DOT[n.priority] ?? PRIORITY_DOT.orange;

  const handleClick = async () => {
    if (unread) await onRead(n.id);
    if (n.href) onClose();
  };

  const Inner = (
    <div
      className={`px-3 py-2.5 flex gap-2.5 items-start cursor-pointer transition-colors
        ${unread ? "bg-white hover:bg-[#F8F7F4]" : "bg-[#F8F7F4] hover:bg-[#F2F2F2] opacity-70"}`}
      onClick={handleClick}
    >
      {/* 優先級色點 */}
      <div className="mt-1 shrink-0">
        <span className={`block w-2 h-2 rounded-full ${dotClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-[12px] leading-snug ${
            unread ? "font-semibold text-[#2C2C2A]" : "text-[#5A5955]"
          }`}
        >
          {n.title}
        </p>
        {n.body && (
          <p className="text-[11px] text-[#5A5955] mt-0.5 leading-snug line-clamp-2">
            {n.body}
          </p>
        )}
        <p className="text-[10px] text-[#9A9890] mt-1">
          {relativeTime(n.created_at)}
        </p>
      </div>
      {unread && (
        <div className="shrink-0 mt-1">
          <span className="block w-1.5 h-1.5 rounded-full bg-[#1A3A5C]" />
        </div>
      )}
    </div>
  );

  if (n.href) {
    return (
      <li>
        <Link href={n.href} onClick={handleClick} className="block">
          {Inner}
        </Link>
      </li>
    );
  }
  return <li>{Inner}</li>;
}

"use client";

/**
 * Domain helper — RP8 站內通知 Realtime 訂閱（client-side hook）
 *
 * 包裝 Supabase Realtime，讓 notification-bell 不直接 import @/lib/supabase。
 * 回傳 subscribe / unsubscribe functions，讓 component 在 useEffect 中使用。
 */

import { createClient } from "@/lib/supabase/client";

type CleanupFn = () => void;

/**
 * 訂閱指定 user 的 user_notifications INSERT 事件。
 *
 * @param userId  auth.uid()（從呼叫方取得，避免在這裡做 async 初始化）
 * @param onNew   每次有新通知時觸發的 callback
 * @returns 清理函式（在 useEffect return 中呼叫）
 */
export function subscribeUserNotifications(
  userId: string,
  onNew: () => void,
): CleanupFn {
  const sb = createClient();

  const channel = sb
    .channel(`user_notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "user_notifications",
        filter: `user_id=eq.${userId}`,
      },
      () => onNew(),
    )
    .subscribe();

  return () => {
    sb.removeChannel(channel);
  };
}

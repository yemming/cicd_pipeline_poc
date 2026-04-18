import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/feedback";

/**
 * Server-side：取得目前登入者 + 是否為 feedback admin。
 *
 * 使用 Supabase `getClaims()`（2025 年官方推薦）：
 *   - 專案啟用非對稱 JWT 簽章後，會在本地驗證簽章（~1ms），不打 Auth server
 *   - 舊 HS256 專案會自動 fallback 回 getUser()（網路往返 ~200ms）
 *
 * React `cache()` 包起來：同一個 request 內多次呼叫只會實際做一次。
 *
 * admin 判斷：依 `FEEDBACK_ADMIN_EMAILS` 環境變數（逗號分隔 email）。
 * 最終把關仍建議走 RLS（DB 層），app 層這個檢查是 UX 層（提前擋、給清楚錯誤）。
 */
export const getCurrentUserAndAdmin = cache(
  async (): Promise<{
    userId: string | null;
    email: string | null;
    isAdmin: boolean;
  }> => {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data?.claims) {
      return { userId: null, email: null, isAdmin: false };
    }

    const claims = data.claims;
    const userId = typeof claims.sub === "string" ? claims.sub : null;
    const email =
      typeof (claims as { email?: unknown }).email === "string"
        ? ((claims as { email: string }).email)
        : null;

    return {
      userId,
      email,
      isAdmin: isAdminEmail(email, process.env.FEEDBACK_ADMIN_EMAILS),
    };
  },
);

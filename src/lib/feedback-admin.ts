import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admins";

/**
 * Server-side：取得目前登入者 + 是否為 admin。
 *
 * 使用 Supabase `getClaims()`（2025 年官方推薦）：
 *   - 專案啟用非對稱 JWT 簽章後，會在本地驗證簽章（~1ms），不打 Auth server
 *   - 舊 HS256 專案會自動 fallback 回 getUser()（網路往返 ~200ms）
 *
 * React `cache()` 包起來：同一個 request 內多次呼叫只會實際做一次。
 *
 * admin 判斷：DB 層 `app_admins` 表（取代 FEEDBACK_ADMIN_EMAILS env）。
 * env 仍保留為 bootstrap fallback，詳見 src/lib/admins.ts。
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
      isAdmin: await isAdmin(email),
    };
  },
);

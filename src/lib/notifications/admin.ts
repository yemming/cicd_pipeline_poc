import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { parseAdminEmails, isAdminEmail } from "@/lib/feedback";

// Notification Hub admin 判斷
// 復用 feedback 模組的 parseAdminEmails / isAdminEmail helper（它們是純函式）
// env 讀取策略：優先 NOTIFICATION_ADMIN_EMAILS，fallback 吃 FEEDBACK_ADMIN_EMAILS
// （部署時只設一個即可，不會雙重維護）

function getAdminEmailsRaw(): string | undefined {
  return process.env.NOTIFICATION_ADMIN_EMAILS ?? process.env.FEEDBACK_ADMIN_EMAILS;
}

export interface NotificationUserContext {
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
}

/**
 * 取當前使用者並判斷是否為 Notification Hub admin。
 * 用 React cache() 包起來，同一 request 內只打一次 Supabase Auth。
 */
export const getCurrentUserAndNotificationAdmin = cache(
  async (): Promise<NotificationUserContext> => {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data?.claims) {
      return { userId: null, email: null, isAdmin: false };
    }

    const claims = data.claims;
    const userId = typeof claims.sub === "string" ? claims.sub : null;
    const email = (claims as { email?: unknown }).email;
    const emailStr = typeof email === "string" ? email : null;

    return {
      userId,
      email: emailStr,
      isAdmin: isAdminEmail(emailStr, getAdminEmailsRaw()),
    };
  },
);

/**
 * Server action / API route 守衛：非 admin 直接 throw。
 * 呼叫者要自己處理 redirect / 回 401/403。
 */
export async function requireNotificationAdmin(): Promise<NotificationUserContext> {
  const ctx = await getCurrentUserAndNotificationAdmin();
  if (!ctx.userId) {
    throw new Error("未登入");
  }
  if (!ctx.isAdmin) {
    throw new Error("無 Notification 管理權限");
  }
  return ctx;
}

/** 列出所有 admin email（供後台 UI 顯示 / debug）*/
export function listAdminEmails(): string[] {
  return parseAdminEmails(getAdminEmailsRaw());
}

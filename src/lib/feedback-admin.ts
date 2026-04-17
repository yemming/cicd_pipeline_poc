import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/feedback";

/**
 * Server-side：取得目前登入者 + 是否為 feedback admin。
 * admin 判斷依 FEEDBACK_ADMIN_EMAILS 環境變數 (逗號分隔 email)。
 */
export async function getCurrentUserAndAdmin(): Promise<{
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email ?? null;
  return {
    userId: user?.id ?? null,
    email,
    isAdmin: isAdminEmail(email, process.env.FEEDBACK_ADMIN_EMAILS),
  };
}

"use server";

/**
 * Server Actions — Org Settings（GRP20 org_mode 寫入）
 *
 * G3-A。寫 system_settings.org_mode，is_app_admin gate（RLS ss_write 也再擋一層）。
 * Result 型別、不 redirect（client 自控 banner / 樂觀更新）。
 */

import { revalidatePath } from "next/cache";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { createServiceClient } from "@/lib/supabase/service";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/group/org-structure";

export async function setOrgModeAction(
  groupId: string,
  orgMode: 3 | 4,
): Promise<ActionResult<{ groupId: string; orgMode: 3 | 4 }>> {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) return { ok: false, error: "請先登入" };
  if (!isAdmin) return { ok: false, error: "僅限管理者設定組織模式" };
  if (!groupId) return { ok: false, error: "缺少集團 id" };
  if (orgMode !== 3 && orgMode !== 4) return { ok: false, error: "組織模式只能是 3 或 4 層" };

  const svc = createServiceClient();
  const { error } = await svc
    .from("system_settings")
    .update({ org_mode: orgMode, updated_at: new Date().toISOString(), updated_by: userId })
    .eq("group_id", groupId);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { groupId, orgMode } };
}

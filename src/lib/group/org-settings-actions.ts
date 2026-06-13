"use server";

/**
 * Server Actions — Org Settings（per-brand org_mode 寫入）
 *
 * G3-A；2026-06-13 改 per-brand。寫 brand_config.metadata.org_mode，is_app_admin gate。
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
  brandId: string,
  orgMode: 3 | 4,
): Promise<ActionResult<{ brandId: string; orgMode: 3 | 4 }>> {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) return { ok: false, error: "請先登入" };
  if (!isAdmin) return { ok: false, error: "僅限管理者設定組織模式" };
  if (!brandId) return { ok: false, error: "缺少品牌 id" };
  if (orgMode !== 3 && orgMode !== 4) return { ok: false, error: "組織模式只能是 3 或 4 層" };

  const svc = createServiceClient();
  // 讀現有 metadata 再 merge，避免覆蓋 warranty 等其他 key
  const { data: cur, error: readErr } = await svc
    .from("brand_config")
    .select("metadata")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (readErr) return { ok: false, error: `讀取失敗：${readErr.message}` };
  const metadata = { ...((cur?.metadata as Record<string, unknown>) ?? {}), org_mode: orgMode };

  const { error } = await svc
    .from("brand_config")
    .update({ metadata })
    .eq("brand_id", brandId);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { brandId, orgMode } };
}

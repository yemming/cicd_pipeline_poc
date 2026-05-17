"use server";

/**
 * Server actions — Dashboard Reminders
 *
 * - subscribeReminderAction(code, slotIndex)
 * - unsubscribeReminderAction(code)
 * - reorderRemindersAction(codes: (string|null)[])      // 整批 set 6 slot
 *
 * 全部回 ActionResult<T>，UI 自控導航 + banner。不在 action 裡 redirect。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { MAX_REMINDER_SLOTS } from "@/domain/reminders.constants";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireUserAndBrand(): Promise<
  | { ok: true; userId: string; brandId: string }
  | { ok: false; error: string }
> {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) return { ok: false, error: "尚未登入，請重新整理後再試" };
  const scope = await getActiveScope();
  if (!scope?.brand_id) return { ok: false, error: "找不到當前 brand scope" };
  return { ok: true, userId, brandId: scope.brand_id };
}

function mapDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "該 slot 已有其他 reminder 佔用，請先取消或拖曳替換";
  if (error.code === "23503") return "找不到對應的 reminder catalog 項目";
  return error.message;
}

/**
 * 訂閱 / 取代某個 slot 的 reminder。
 * - 先把該 slot 既有 row 刪掉、再 insert 新的（取代行為）
 * - 同時若該 code 在別的 slot 已存在 → 也一併刪除（避免 unique(code) 衝突）
 */
export async function subscribeReminderAction(
  code: string,
  slotIndex: number,
): Promise<ActionResult<{ slotIndex: number; code: string }>> {
  if (slotIndex < 0 || slotIndex >= MAX_REMINDER_SLOTS) {
    return { ok: false, error: `slot_index 必須在 0..${MAX_REMINDER_SLOTS - 1}` };
  }
  if (!code) return { ok: false, error: "缺少 reminder code" };

  const ctx = await requireUserAndBrand();
  if (!ctx.ok) return ctx;

  const supabase = await createClient();

  // 1) 清掉同 slot 或同 code 的舊 row（兩個 unique constraint 都可能擋）
  const { error: delErr } = await supabase
    .from("user_reminder_subscriptions")
    .delete()
    .eq("user_id", ctx.userId)
    .eq("brand_id", ctx.brandId)
    .or(`slot_index.eq.${slotIndex},reminder_code.eq.${code}`);
  if (delErr) return { ok: false, error: mapDbError(delErr) };

  // 2) insert 新 row
  const { error: insErr } = await supabase
    .from("user_reminder_subscriptions")
    .insert({
      user_id: ctx.userId,
      brand_id: ctx.brandId,
      reminder_code: code,
      slot_index: slotIndex,
      is_visible: true,
    });
  if (insErr) return { ok: false, error: mapDbError(insErr) };

  revalidatePath("/dashboard");
  return { ok: true, data: { slotIndex, code } };
}

export async function unsubscribeReminderAction(
  code: string,
): Promise<ActionResult<{ code: string }>> {
  if (!code) return { ok: false, error: "缺少 reminder code" };

  const ctx = await requireUserAndBrand();
  if (!ctx.ok) return ctx;

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_reminder_subscriptions")
    .delete()
    .eq("user_id", ctx.userId)
    .eq("brand_id", ctx.brandId)
    .eq("reminder_code", code);

  if (error) return { ok: false, error: mapDbError(error) };

  revalidatePath("/dashboard");
  return { ok: true, data: { code } };
}

/**
 * 整批 set 6 個 slot：用 transactional 行為 — 先 delete all、再 bulk insert。
 *
 * codes 是長度 6 的陣列，index = slot_index；null 代表該 slot 留空。
 */
export async function reorderRemindersAction(
  codes: (string | null)[],
): Promise<ActionResult<{ codes: (string | null)[] }>> {
  if (!Array.isArray(codes) || codes.length !== MAX_REMINDER_SLOTS) {
    return { ok: false, error: `codes 必須是長度 ${MAX_REMINDER_SLOTS} 的陣列` };
  }
  // 不可有重複的非 null code
  const seen = new Set<string>();
  for (const c of codes) {
    if (c == null) continue;
    if (seen.has(c)) return { ok: false, error: `提醒「${c}」重複出現在多個 slot` };
    seen.add(c);
  }

  const ctx = await requireUserAndBrand();
  if (!ctx.ok) return ctx;

  const supabase = await createClient();

  // 1) 刪掉該 user × brand 全部訂閱（簡單 + 對齊 unique constraint）
  const { error: delErr } = await supabase
    .from("user_reminder_subscriptions")
    .delete()
    .eq("user_id", ctx.userId)
    .eq("brand_id", ctx.brandId);
  if (delErr) return { ok: false, error: mapDbError(delErr) };

  // 2) bulk insert 非 null 的 slot
  const rows = codes
    .map((code, idx) => (code ? {
      user_id: ctx.userId,
      brand_id: ctx.brandId,
      reminder_code: code,
      slot_index: idx,
      is_visible: true,
    } : null))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length > 0) {
    const { error: insErr } = await supabase
      .from("user_reminder_subscriptions")
      .insert(rows);
    if (insErr) return { ok: false, error: mapDbError(insErr) };
  }

  revalidatePath("/dashboard");
  return { ok: true, data: { codes } };
}

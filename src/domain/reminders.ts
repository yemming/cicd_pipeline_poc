/**
 * Domain Helper — Dashboard Reminders
 *
 * Dashboard 右上角 6 個 StatBubble 的後端入口。
 * UI 只需呼叫 `getDashboardReminders(...)` 拿 6 個 slot 渲染。
 *
 * 寫入動作放在 `src/lib/dashboard/reminder-actions.ts`（server action）。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { runReminderQuery } from "@/domain/reminders/registry";
import {
  DEFAULT_SUBSCRIBED_CODES,
  MAX_REMINDER_SLOTS,
  type ReminderAccent,
  type ReminderCategory,
  type ReminderDefinition,
  type ReminderItem,
  type ReminderSlots,
} from "@/domain/reminders.constants";

export type { ReminderDefinition, ReminderItem, ReminderSlots } from "@/domain/reminders.constants";

/**
 * 撈 catalog 全部啟用的 reminder（給訂閱 modal 用）。
 */
export async function getAllReminderCatalog(): Promise<ReminderDefinition[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reminder_definitions")
    .select(
      "code, label, description, icon, accent, category, query_kind, target_href_template, permission, display_order",
    )
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("[reminders.getAllReminderCatalog]", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    code: row.code,
    label: row.label,
    description: row.description,
    icon: row.icon,
    accent: row.accent as ReminderAccent,
    category: row.category as ReminderCategory,
    query_kind: row.query_kind,
    target_href_template: row.target_href_template,
    permission: row.permission,
    display_order: row.display_order,
  }));
}

/**
 * 撈某 user × brand 訂閱的 slot 對照表（slotIndex → reminder_code）。
 */
async function getUserSlots(
  userId: string,
  brandId: string,
): Promise<{ slotIndex: number; reminderCode: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_reminder_subscriptions")
    .select("slot_index, reminder_code")
    .eq("user_id", userId)
    .eq("brand_id", brandId)
    .eq("is_visible", true)
    .order("slot_index", { ascending: true });

  if (error) {
    console.error("[reminders.getUserSlots]", error);
    return [];
  }
  return (data ?? []).map((r) => ({ slotIndex: r.slot_index, reminderCode: r.reminder_code }));
}

/**
 * 第一次開 dashboard 時、若用戶還沒訂任何 → 自動塞預設 6 個。
 *
 * 不會強制重設、只在「該 user × brand 沒有任何 row」時塞。
 */
export async function ensureDefaultSubscriptions(
  userId: string,
  brandId: string,
): Promise<void> {
  const supabase = await createClient();
  const { count, error: countErr } = await supabase
    .from("user_reminder_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("brand_id", brandId);

  if (countErr) {
    console.error("[reminders.ensureDefaultSubscriptions:count]", countErr);
    return;
  }
  if ((count ?? 0) > 0) return;

  const rows = DEFAULT_SUBSCRIBED_CODES.map((code, idx) => ({
    user_id: userId,
    brand_id: brandId,
    reminder_code: code,
    slot_index: idx,
    is_visible: true,
  }));

  const { error: insertErr } = await supabase
    .from("user_reminder_subscriptions")
    .insert(rows);
  if (insertErr) {
    console.info("[reminders.ensureDefaultSubscriptions:insert]", insertErr);
  }
}

/**
 * 撈 user × brand 已訂閱的 6 個 reminder + 對每個跑 count query。
 * 沒訂的 slot 用 null 表示。
 */
export async function getDashboardReminders(
  userId: string,
  brandId: string,
): Promise<ReminderSlots> {
  // 1) 若全空 → 塞預設
  await ensureDefaultSubscriptions(userId, brandId);

  // 2) 撈 slots + catalog（catalog 用於把 code → label/icon/accent/…）
  const [slots, catalog] = await Promise.all([
    getUserSlots(userId, brandId),
    getAllReminderCatalog(),
  ]);
  const catalogByCode = new Map(catalog.map((c) => [c.code, c]));

  // 3) 平行跑每個 slot 的 count query
  const enriched = await Promise.all(
    slots.map(async ({ slotIndex, reminderCode }) => {
      const def = catalogByCode.get(reminderCode);
      if (!def) {
        return null; // catalog 被停用 / 刪掉了 → 該 slot 渲染成空
      }
      const result = await runReminderQuery(def.query_kind, { brandId, userId });
      const item: ReminderItem = {
        slotIndex,
        code: def.code,
        label: def.label,
        description: def.description,
        icon: def.icon,
        accent: def.accent,
        category: def.category,
        count: result.count,
        targetHref: def.target_href_template,
        error: result.error ?? null,
      };
      return item;
    }),
  );

  // 4) 組成 6 slot 陣列（沒訂的位置是 null）
  const out: ReminderSlots = Array.from({ length: MAX_REMINDER_SLOTS }, () => null);
  for (const item of enriched) {
    if (!item) continue;
    if (item.slotIndex >= 0 && item.slotIndex < MAX_REMINDER_SLOTS) {
      out[item.slotIndex] = item;
    }
  }
  return out;
}

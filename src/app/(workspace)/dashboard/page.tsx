/**
 * Dashboard page (server component) — 預先撈訂閱 reminder + count，
 * 把整批塞給 <DashboardClient />，避免 client 端再多一個 round-trip。
 *
 * 沒登入 / 沒 brand scope → 給空 reminder slot；client 端模組卡片照樣可用。
 */

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getAllReminderCatalog, getDashboardReminders } from "@/domain/reminders";
import { MAX_REMINDER_SLOTS, type ReminderSlots } from "@/domain/reminders.constants";

import DashboardClient from "./_components/dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [{ userId }, scope] = await Promise.all([
    getCurrentUserAndAdmin(),
    getActiveScope(),
  ]);

  let reminders: ReminderSlots = Array.from({ length: MAX_REMINDER_SLOTS }, () => null);
  if (userId && scope?.brand_id) {
    reminders = await getDashboardReminders(userId, scope.brand_id);
  }

  const catalog = await getAllReminderCatalog();

  return <DashboardClient reminders={reminders} catalog={catalog} />;
}

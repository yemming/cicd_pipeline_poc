"use server";

/**
 * Server Actions — 推播通知設定（銷售 + 售後共用）
 *
 * - 操作 notification_subscriptions 表（module='sales' / 'aftersales' 之 row）
 * - 權限沿用 CRM 共用 PERMISSIONS.CUSTOMER_EDIT（先有先用，未來真接 RBAC 再切細）
 * - Result 型別、不 redirect；UI client 自己決定 router.refresh()
 * - revalidatePath 同時打 sales / aftersales 兩條(模板 / target 改動跨頁面)
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  eventCodesForModule,
  type SalesNotificationEventCode,
  type SalesNotificationModule,
} from "@/domain/sales-notifications.constants";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATHS = [
  "/sales/crm/push-notifications",
  "/aftersales/crm/push-notifications",
];

function revalidateDual() {
  for (const p of PAGE_PATHS) revalidatePath(p);
}

function isValidModule(m: string): m is SalesNotificationModule {
  return m === "sales" || m === "aftersales";
}

function isEventCodeOfModule(
  code: string,
  module: SalesNotificationModule,
): code is SalesNotificationEventCode {
  return (eventCodesForModule(module) as readonly string[]).includes(code);
}

function mapDbError(error: { code?: string; message: string }): string {
  if (error.code === "23503") return "找不到對應的通知目標(外鍵錯誤)";
  if (error.code === "23505") return "已有同樣的訂閱(重複)";
  if (error.code === "23514") {
    if (error.message.includes("module"))
      return "module 值不合法(只接受 sales / aftersales / admin / system)";
  }
  return `儲存失敗:${error.message}`;
}

/** 切換訂閱啟用狀態 */
export async function toggleSubscriptionActiveAction(
  id: string,
  next: boolean,
  module: SalesNotificationModule = "sales",
): Promise<ActionResult<{ id: string; is_active: boolean }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!isValidModule(module))
    return { ok: false, error: "module 不合法" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_subscriptions")
    .update({ is_active: next })
    .eq("id", id)
    .eq("module", module)
    .select("id, is_active")
    .single();
  if (error) return { ok: false, error: mapDbError(error) };
  revalidateDual();
  return {
    ok: true,
    data: { id: data.id as string, is_active: data.is_active as boolean },
  };
}

/** 新增訂閱(事件 × target × 模板) */
export async function createSubscriptionAction(input: {
  event_code: string;
  target_id: string;
  template_code: string | null;
  module?: SalesNotificationModule;
}): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const mod: SalesNotificationModule = input.module ?? "sales";
  if (!isValidModule(mod))
    return { ok: false, error: "module 不合法" };
  const brand = (await getActiveScope()).brand_id;
  if (!isEventCodeOfModule(input.event_code, mod))
    return { ok: false, error: `事件 code 不在 ${mod} 模組事件清單內` };
  if (!input.target_id) return { ok: false, error: "請選擇通知目標" };
  const supabase = await createClient();

  // 阻止同一個 (event_code, target_id) 重複訂閱(同事件同 target 一條就夠)
  const { data: dup, error: dupErr } = await supabase
    .from("notification_subscriptions")
    .select("id")
    .eq("module", mod)
    .eq("brand_id", brand)
    .eq("event_code", input.event_code)
    .eq("target_id", input.target_id)
    .maybeSingle();
  if (dupErr) return { ok: false, error: mapDbError(dupErr) };
  if (dup) return { ok: false, error: "此事件已訂閱該通知目標" };

  const { data, error } = await supabase
    .from("notification_subscriptions")
    .insert({
      event_code: input.event_code,
      target_id: input.target_id,
      template_code: input.template_code ?? null,
      filter_rules: {},
      is_active: true,
      brand_id: brand,
      module: mod,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error) };
  revalidateDual();
  return { ok: true, data: { id: data.id as string } };
}

/** 刪除訂閱 */
export async function deleteSubscriptionAction(
  id: string,
  module: SalesNotificationModule = "sales",
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!isValidModule(module))
    return { ok: false, error: "module 不合法" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_subscriptions")
    .delete()
    .eq("id", id)
    .eq("module", module);
  if (error) return { ok: false, error: mapDbError(error) };
  revalidateDual();
  return { ok: true, data: { id } };
}

"use server";

/**
 * Server Actions — 客戶「請勿聯繫 / 已故」標記（Russell 2026-07-31 CRM 缺口 4.3）
 *
 * 寫入 customers.contact_restriction；設定時一併取消該客戶所有 status='pending' 的
 * call_tasks（已排定但尚未執行的自動/人工電訪任務都要跟著停止，否則標記形同虛設）。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, getCurrentUserContext } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { writeAuditLog } from "@/domain/audit-logs";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ContactRestriction = "do_not_contact" | "deceased";

export async function setCustomerContactRestrictionAction(
  customerId: string,
  restriction: ContactRestriction,
): Promise<ActionResult<{ id: string; cancelled_tasks: number }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const ctx = await getCurrentUserContext();
  if (!customerId) return { ok: false, error: "缺少客戶 ID" };

  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();

  const { error } = await supabase
    .from("customers")
    .update({ contact_restriction: restriction })
    .eq("id", customerId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: error.message };

  // 取消所有 pending 電訪任務——標記後不該再有排定中的自動/人工任務
  const { data: cancelled, error: cancelErr } = await supabase
    .from("call_tasks")
    .update({ status: "skipped" })
    .eq("brand_id", brand)
    .eq("customer_id", customerId)
    .eq("status", "pending")
    .select("id");
  if (cancelErr) {
    return { ok: false, error: `標記成功但取消待處理任務失敗：${cancelErr.message}` };
  }

  await writeAuditLog({
    table_name: "customers",
    record_id: customerId,
    action: "CONTACT_RESTRICTION_SET",
    actor_id: ctx.userId,
    brand_id: brand,
    before: null,
    after: { restriction, cancelled_tasks: cancelled?.length ?? 0 },
  });

  revalidatePath(`/crm/aftersales/customer-base/${customerId}`);
  revalidatePath(`/parts/aftersales/customers/${customerId}`);
  return { ok: true, data: { id: customerId, cancelled_tasks: cancelled?.length ?? 0 } };
}

export async function clearCustomerContactRestrictionAction(
  customerId: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const ctx = await getCurrentUserContext();
  if (!customerId) return { ok: false, error: "缺少客戶 ID" };

  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();

  const { error } = await supabase
    .from("customers")
    .update({ contact_restriction: null })
    .eq("id", customerId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    table_name: "customers",
    record_id: customerId,
    action: "CONTACT_RESTRICTION_CLEARED",
    actor_id: ctx.userId,
    brand_id: brand,
    before: null,
    after: {},
  });

  revalidatePath(`/crm/aftersales/customer-base/${customerId}`);
  revalidatePath(`/parts/aftersales/customers/${customerId}`);
  return { ok: true, data: { id: customerId } };
}

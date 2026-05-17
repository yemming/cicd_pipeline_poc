"use server";

/**
 * Server actions — CRM06B 自動化規則 toggle
 *
 * 走 Result<T> 型別、不 redirect、UI 自控導航。
 */

import { revalidatePath } from "next/cache";
import { setAutomationRuleActive } from "@/domain/sales-push-automation";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function toggleAutomationRuleAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string; is_active: boolean }>> {
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_EDIT))) {
    return { ok: false, error: "沒有切換自動化規則的權限" };
  }
  const res = await setAutomationRuleActive(id, active);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/crm/aftersales/push-notifications");
  revalidatePath("/crm/sales/push-notifications");
  return { ok: true, data: { id, is_active: active } };
}

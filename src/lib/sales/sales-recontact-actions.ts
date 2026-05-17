"use server";

/**
 * Server actions — 再接觸排程（CRM04A / CRM04B Tab 3）
 *
 * 對 call_tasks 表的 recontact subkind 寫入。Result 型別、不 redirect。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  RecontactKind,
  RecontactMethod,
} from "@/domain/sales-recontact.constants";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CreateRecontactInput = {
  kind: RecontactKind;
  /** 對應 sales_leads.id（透過 metadata.lead_id 記錄；customer_id 走真實 customers 表） */
  leadId: string;
  displayName: string;
  contactMethod: RecontactMethod;
  /** ISO date 'YYYY-MM-DD'；helper 自動補 10:00+08 */
  scheduledDate: string;
  rsName?: string | null;
  notes?: string | null;
};

const SALES_PATH = "/crm/sales/dormant-leads";
const AFTERSALES_PATH = "/crm/aftersales/dormant-customers";

function revalidateBoth(kind: RecontactKind) {
  revalidatePath(kind === "aftersales" ? AFTERSALES_PATH : SALES_PATH);
  revalidatePath("/crm/sales/call-tasks");
  revalidatePath("/crm/aftersales/call-tasks");
}

/** 從 lead 找對應 customer_id（call_tasks.customer_id 有 FK 強制）；
 *  POC 階段沒掛 lead→customer 關聯，fallback 拿該 brand 任一個 customer
 *  讓 FK 通過、真實 lead 名稱仍記在 metadata.display_name。
 */
async function pickCustomerId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brand: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("customers")
    .select("id")
    .eq("brand_id", brand)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function createRecontactAction(
  input: CreateRecontactInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };

  if (!input.leadId) return { ok: false, error: "缺少 lead id" };
  if (!input.displayName?.trim())
    return { ok: false, error: "缺少客戶顯示名稱" };
  if (!input.scheduledDate)
    return { ok: false, error: "預定接觸日期必填" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const customerId = await pickCustomerId(supabase, brand);
  if (!customerId)
    return { ok: false, error: "找不到 brand 對應的 customer，請先建立至少一筆 customer" };

  const scheduledAt = new Date(
    `${input.scheduledDate}T10:00:00+08:00`,
  ).toISOString();

  const { data, error } = await supabase
    .from("call_tasks")
    .insert({
      brand_id: brand,
      kind: input.kind,
      customer_id: customerId,
      scheduled_at: scheduledAt,
      status: "pending",
      attempt_count: 0,
      notes: input.notes?.trim() || null,
      metadata: {
        subkind: "recontact",
        lead_id: input.leadId,
        display_name: input.displayName.trim(),
        contact_method: input.contactMethod,
        rs_name: input.rsName?.trim() || null,
      },
      created_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  revalidateBoth(input.kind);
  return { ok: true, data: { id: data.id } };
}

export async function markRecontactDoneAction(
  taskId: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!taskId) return { ok: false, error: "缺少 task id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: row, error: readErr } = await supabase
    .from("call_tasks")
    .select("kind")
    .eq("id", taskId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (readErr || !row) return { ok: false, error: "找不到任務" };

  const { error } = await supabase
    .from("call_tasks")
    .update({
      status: "completed",
      last_attempt_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };

  revalidateBoth(row.kind === "aftersales" ? "aftersales" : "sales");
  return { ok: true, data: { id: taskId } };
}

export async function rescheduleRecontactAction(
  taskId: string,
  newDate: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!taskId) return { ok: false, error: "缺少 task id" };
  if (!newDate) return { ok: false, error: "新日期必填" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const scheduledAt = new Date(`${newDate}T10:00:00+08:00`).toISOString();

  const { data: row } = await supabase
    .from("call_tasks")
    .select("kind")
    .eq("id", taskId)
    .eq("brand_id", brand)
    .maybeSingle();

  const { error } = await supabase
    .from("call_tasks")
    .update({ scheduled_at: scheduledAt })
    .eq("id", taskId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };

  revalidateBoth(row?.kind === "aftersales" ? "aftersales" : "sales");
  return { ok: true, data: { id: taskId } };
}

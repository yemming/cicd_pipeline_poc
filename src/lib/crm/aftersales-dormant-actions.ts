"use server";

/**
 * Server Actions — 售後休眠流失管理（/crm/aftersales/dormant-customers · M02-6）
 *
 * - 共用 PERMISSIONS.CUSTOMER_VIEW / CUSTOMER_EDIT（CRM 模組共用權限）
 * - Result 型別、不 redirect、由 client 自決導航
 * - reactivate 同時建一筆 aftersales call_task（D+0 排程）
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/crm/aftersales/dormant-customers";

function mapDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "重複資料：此客戶已有任務";
  if (error.code === "23503") return "關聯資料不存在（請確認客戶/SA 已建立）";
  if (error.code === "23514") return "資料未通過驗證（流失原因 / 狀態值不合法）";
  if (error.code === "42501") return "權限不足（RLS 拒絕）";
  return `操作失敗：${error.message}`;
}

// ──────────────────────────────────────────────────────────────────────────
// 重新啟動：建一筆 aftersales call_task（D+0）+ 不改 dormancy_status
//   假設：SA 跑完電訪後才會手動改狀態回 active，因為「建任務」不等於「重新啟動成功」
// ──────────────────────────────────────────────────────────────────────────

export type ReactivateInput = {
  customer_id: string;
  assignee_id: string;
  notes?: string | null;
};

export async function reactivateAftersalesCustomerAction(
  input: ReactivateInput,
): Promise<ActionResult<{ task_id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };
  if (!input.customer_id) return { ok: false, error: "客戶必選" };
  if (!input.assignee_id) return { ok: false, error: "請指派電訪 SA" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 確認客戶屬於當前 brand + 在休眠狀態
  const { data: cust, error: cErr } = await supabase
    .from("customers")
    .select("id, aftersales_dormancy_status")
    .eq("id", input.customer_id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (cErr) return { ok: false, error: mapDbError(cErr) };
  if (!cust) return { ok: false, error: "找不到客戶" };
  const status = cust.aftersales_dormancy_status as string | null;
  if (status === "lost") {
    return { ok: false, error: "已標記流失的客戶不可建立電訪任務" };
  }

  // 建 aftersales call_task（D+0 today、status=pending）
  const today = new Date();
  today.setHours(10, 0, 0, 0); // 早上 10 點
  const { data: task, error: tErr } = await supabase
    .from("call_tasks")
    .insert({
      brand_id: brand,
      kind: "aftersales",
      customer_id: input.customer_id,
      assignee_id: input.assignee_id,
      scheduled_at: today.toISOString(),
      status: "pending",
      attempt_count: 0,
      answers: {},
      notes: input.notes?.trim() || "休眠喚醒電訪（M02-6 系統建立）",
      call_type: "outbound",
      metadata: { source: "aftersales_dormant_reactivate" },
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (tErr) return { ok: false, error: mapDbError(tErr) };

  revalidatePath(PAGE_PATH);
  revalidatePath("/crm/aftersales/call-tasks");
  return { ok: true, data: { task_id: task.id } };
}

// ──────────────────────────────────────────────────────────────────────────
// 標記流失：寫 aftersales_dormancy_status='lost' + lost_reason + lost_at
// ──────────────────────────────────────────────────────────────────────────

export type MarkLostInput = {
  customer_id: string;
  reason:
    | "maintenance_overdue"
    | "low_nps"
    | "warranty_expired"
    | "desmo_overdue"
    | "unreachable"
    | "other";
  notes?: string | null;
};

const VALID_REASONS = new Set<MarkLostInput["reason"]>([
  "maintenance_overdue",
  "low_nps",
  "warranty_expired",
  "desmo_overdue",
  "unreachable",
  "other",
]);

export async function markAftersalesLostAction(
  input: MarkLostInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!input.customer_id) return { ok: false, error: "客戶必選" };
  if (!VALID_REASONS.has(input.reason))
    return { ok: false, error: "流失原因不合法" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 把 notes 寫到 customers.notes（appendix）— 不動 metadata，避免污染既有結構
  const updPayload: Record<string, unknown> = {
    aftersales_dormancy_status: "lost",
    aftersales_lost_reason: input.reason,
    aftersales_lost_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("customers")
    .update(updPayload)
    .eq("id", input.customer_id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: input.customer_id } };
}

// ──────────────────────────────────────────────────────────────────────────
// 取消流失（manual override）— 給 SA 解鎖
// ──────────────────────────────────────────────────────────────────────────

export async function unmarkAftersalesLostAction(
  customerId: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!customerId) return { ok: false, error: "缺少 customer id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("customers")
    .update({
      aftersales_dormancy_status: null,
      aftersales_lost_reason: null,
      aftersales_lost_at: null,
    })
    .eq("id", customerId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: customerId } };
}

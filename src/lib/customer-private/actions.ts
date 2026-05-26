"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  canEditSalesPrivate,
  canEditServicePrivate,
  getCurrentUserDepartment,
} from "@/lib/rbac/department";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type SalesPrivatePatch = {
  credit_limit?: number | null;
  sales_notes?: string | null;
  discount_history?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
};

export type ServicePrivatePatch = {
  health_notes?: string | null;
  complaint_history?: Array<Record<string, unknown>>;
  service_notes?: string | null;
  metadata?: Record<string, unknown>;
};

export async function upsertSalesPrivateAction(
  customerId: string,
  patch: SalesPrivatePatch,
): Promise<ActionResult<{ customer_id: string }>> {
  const dept = await getCurrentUserDepartment();
  if (!canEditSalesPrivate(dept)) {
    return { ok: false, error: "權限不足：僅銷售部門 / 管理者可編輯銷售私房欄位" };
  }
  const { userId } = await getCurrentUserAndAdmin();
  const supabase = await createClient();

  // 先找出 brand_id（從 customers 主表）
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("brand_id")
    .eq("id", customerId)
    .maybeSingle();
  if (custErr || !customer) {
    return { ok: false, error: "找不到客戶或無權限" };
  }

  const row: Record<string, unknown> = {
    customer_id: customerId,
    brand_id: customer.brand_id,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };
  if (patch.credit_limit !== undefined) row.credit_limit = patch.credit_limit;
  if (patch.sales_notes !== undefined) row.sales_notes = patch.sales_notes;
  if (patch.discount_history !== undefined)
    row.discount_history = patch.discount_history;
  if (patch.metadata !== undefined) row.metadata = patch.metadata;

  const { error } = await supabase
    .from("customer_sales_private")
    .upsert(row, { onConflict: "customer_id" });
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };

  revalidatePath(`/sales/customers/${customerId}`);
  revalidatePath("/sales/customers");
  return { ok: true, data: { customer_id: customerId } };
}

export async function upsertServicePrivateAction(
  customerId: string,
  patch: ServicePrivatePatch,
): Promise<ActionResult<{ customer_id: string }>> {
  const dept = await getCurrentUserDepartment();
  if (!canEditServicePrivate(dept)) {
    return { ok: false, error: "權限不足：僅售後部門 / 管理者可編輯售後私房欄位" };
  }
  const { userId } = await getCurrentUserAndAdmin();
  const supabase = await createClient();

  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("brand_id")
    .eq("id", customerId)
    .maybeSingle();
  if (custErr || !customer) {
    return { ok: false, error: "找不到客戶或無權限" };
  }

  const row: Record<string, unknown> = {
    customer_id: customerId,
    brand_id: customer.brand_id,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };
  if (patch.health_notes !== undefined) row.health_notes = patch.health_notes;
  if (patch.complaint_history !== undefined)
    row.complaint_history = patch.complaint_history;
  if (patch.service_notes !== undefined) row.service_notes = patch.service_notes;
  if (patch.metadata !== undefined) row.metadata = patch.metadata;

  const { error } = await supabase
    .from("customer_service_private")
    .upsert(row, { onConflict: "customer_id" });
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };

  revalidatePath("/service/appointments");
  return { ok: true, data: { customer_id: customerId } };
}

/** 指派銷售主責人（assigned_rs_user_id） */
export async function assignSalesOwnerAction(
  customerId: string,
  rsUserId: string | null,
): Promise<ActionResult<{ customer_id: string }>> {
  const dept = await getCurrentUserDepartment();
  if (!canEditSalesPrivate(dept) && !dept.is_dept_manager) {
    return { ok: false, error: "權限不足：僅銷售主管 / 管理者可指派業務" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ assigned_rs_user_id: rsUserId })
    .eq("id", customerId);
  if (error) return { ok: false, error: `指派失敗：${error.message}` };

  revalidatePath(`/sales/customers/${customerId}`);
  revalidatePath("/sales/customers");
  return { ok: true, data: { customer_id: customerId } };
}

/** 指派售後主責人（assigned_sa_user_id） */
export async function assignServiceOwnerAction(
  customerId: string,
  saUserId: string | null,
): Promise<ActionResult<{ customer_id: string }>> {
  const dept = await getCurrentUserDepartment();
  if (!canEditServicePrivate(dept) && !dept.is_dept_manager) {
    return { ok: false, error: "權限不足：僅售後主管 / 管理者可指派服務顧問" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ assigned_sa_user_id: saUserId })
    .eq("id", customerId);
  if (error) return { ok: false, error: `指派失敗：${error.message}` };

  revalidatePath("/service/appointments");
  return { ok: true, data: { customer_id: customerId } };
}

"use server";

/**
 * Server Actions — 投訴記錄（complaints 表）
 * 適用：取車後投訴記錄（B19-01）、客戶人車檔案投訴歷史卡。
 * 讀取走 src/domain/complaints.ts。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserContext } from "@/lib/rbac/policies";
import { searchSalesOrdersForComplaint } from "@/domain/complaints";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CreateComplaintInput = {
  customer_id: string;
  /** 關聯車輛（選填） */
  vehicle_id?: string | null;
  /** 關聯工單（選填，取車後投訴建議填入原 RO） */
  repair_order_id?: string | null;
  /** F-3：關聯銷售訂單（選填，銷售後投訴建議填入原銷售訂單） */
  related_sales_order_id?: string | null;
  /** 投訴類型：service（服務態度）/ quality（維修品質）/ pricing（費用爭議）/ other（其他） */
  complaint_type: string;
  description: string;
};

/** 新增取車後投訴記錄（B19-01）*/
export async function createComplaintAction(
  input: CreateComplaintInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_VIEW);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };

  if (!input.customer_id) return { ok: false, error: "缺少客戶 ID" };
  if (!input.complaint_type?.trim()) return { ok: false, error: "請選擇投訴類型" };
  if (!input.description?.trim()) return { ok: false, error: "請填寫投訴描述" };

  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("complaints")
    .insert({
      brand_id: brand,
      customer_id: input.customer_id,
      vehicle_id: input.vehicle_id ?? null,
      repair_order_id: input.repair_order_id ?? null,
      related_sales_order_id: input.related_sales_order_id ?? null,
      complaint_type: input.complaint_type.trim(),
      description: input.description.trim(),
      status: "open",
      created_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[complaint-actions] createComplaintAction", error.message);
    return { ok: false, error: `儲存失敗：${error.message}` };
  }

  revalidatePath(`/parts/aftersales/customers/${input.customer_id}`);
  return { ok: true, data: { id: data.id } };
}

/**
 * F-3：依關鍵字搜尋銷售訂單（供新增投訴時選擇關聯銷售訂單）。
 * 回傳陣列：{ id, order_no, customer_name, vehicle_model_name, status }
 */
export async function searchSalesOrdersAction(keyword: string): Promise<Array<{
  id: string;
  order_no: string;
  customer_name: string | null;
  vehicle_model_name: string | null;
  status: string;
}>> {
  await requirePermission(PERMISSIONS.CUSTOMER_VIEW);
  return searchSalesOrdersForComplaint(keyword);
}

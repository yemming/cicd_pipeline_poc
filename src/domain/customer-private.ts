/**
 * Domain Helper — P-08 客戶部門私房欄位
 *
 * 兩張子表：
 *   - customer_sales_private  銷售敏感資料（credit_limit / sales_notes / discount_history）
 *   - customer_service_private 售後敏感資料（health_notes / complaint_history / service_notes）
 *
 * RLS 只擋 brand_id；部門隔離靠 [src/lib/rbac/department.ts] 的 canView/Edit*Private()。
 * UI 一律 import 這支讀、import [src/lib/customer-private/actions.ts] 寫。
 *
 * 讀取行為：沒權限的呼叫端拿到 `null`（不是丟錯）— 給 UI 自由決定「不渲染區塊」還是「顯示鎖頭」。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  canViewSalesPrivate,
  canViewServicePrivate,
  getCurrentUserDepartment,
} from "@/lib/rbac/department";

export type SalesPrivate = {
  customer_id: string;
  brand_id: string;
  credit_limit: number | null;
  sales_notes: string | null;
  discount_history: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  updated_at: string;
  updated_by: string | null;
};

export type ServicePrivate = {
  customer_id: string;
  brand_id: string;
  health_notes: string | null;
  complaint_history: Array<Record<string, unknown>>;
  service_notes: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
  updated_by: string | null;
};

export async function getSalesPrivate(
  customerId: string,
): Promise<SalesPrivate | null> {
  const dept = await getCurrentUserDepartment();
  if (!canViewSalesPrivate(dept)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_sales_private")
    .select(
      "customer_id, brand_id, credit_limit, sales_notes, discount_history, metadata, updated_at, updated_by",
    )
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) {
    console.error("[customer-private] getSalesPrivate failed:", error.message);
    return null;
  }
  return data as SalesPrivate | null;
}

export async function getServicePrivate(
  customerId: string,
): Promise<ServicePrivate | null> {
  const dept = await getCurrentUserDepartment();
  if (!canViewServicePrivate(dept)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_service_private")
    .select(
      "customer_id, brand_id, health_notes, complaint_history, service_notes, metadata, updated_at, updated_by",
    )
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) {
    console.error("[customer-private] getServicePrivate failed:", error.message);
    return null;
  }
  return data as ServicePrivate | null;
}

/**
 * 批次撈：給 list view 一次取多筆。沒權限直接回空 Map（不打 DB）。
 */
export async function listSalesPrivateByCustomerIds(
  customerIds: string[],
): Promise<Map<string, SalesPrivate>> {
  if (customerIds.length === 0) return new Map();
  const dept = await getCurrentUserDepartment();
  if (!canViewSalesPrivate(dept)) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_sales_private")
    .select(
      "customer_id, brand_id, credit_limit, sales_notes, discount_history, metadata, updated_at, updated_by",
    )
    .in("customer_id", customerIds);
  if (error) {
    console.error("[customer-private] listSalesPrivate failed:", error.message);
    return new Map();
  }
  const map = new Map<string, SalesPrivate>();
  for (const r of (data ?? []) as SalesPrivate[]) map.set(r.customer_id, r);
  return map;
}

export async function listServicePrivateByCustomerIds(
  customerIds: string[],
): Promise<Map<string, ServicePrivate>> {
  if (customerIds.length === 0) return new Map();
  const dept = await getCurrentUserDepartment();
  if (!canViewServicePrivate(dept)) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_service_private")
    .select(
      "customer_id, brand_id, health_notes, complaint_history, service_notes, metadata, updated_at, updated_by",
    )
    .in("customer_id", customerIds);
  if (error) {
    console.error("[customer-private] listServicePrivate failed:", error.message);
    return new Map();
  }
  const map = new Map<string, ServicePrivate>();
  for (const r of (data ?? []) as ServicePrivate[]) map.set(r.customer_id, r);
  return map;
}

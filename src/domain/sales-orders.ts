import "server-only";

/**
 * Domain Helper — Sales Orders（成交訂單合約書）
 *
 * RS04 新車訂購合約書 + 中古車買賣切結合約書
 * UI 嚴禁直接 import @/lib/supabase；所有讀寫透過此 helper。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  Result,
  SalesOrderRow,
  SalesOrderDetail,
  CreateSalesOrderInput,
  UpdateSalesOrderInput,
  ListSalesOrdersFilter,
  CustomerPickRow,
  VehicleModelPickRow,
} from "./sales-orders.constants";

// ─────────────────────────────────────────────────────────────
// Re-export types from .constants.ts（讓 server-side caller 仍可 import from "@/domain/sales-orders"）
// ─────────────────────────────────────────────────────────────
export type {
  Result,
  SalesOrderRow,
  SalesOrderDetail,
  CreateSalesOrderInput,
  UpdateSalesOrderInput,
  ListSalesOrdersFilter,
  CustomerPickRow,
  VehicleModelPickRow,
} from "./sales-orders.constants";

export const ORDERS_PAGE_SIZE_DEFAULT = 50;

export async function listSalesOrders(
  filter: ListSalesOrdersFilter = {},
): Promise<{ rows: SalesOrderRow[]; totalCount: number }> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.max(1, filter.pageSize ?? ORDERS_PAGE_SIZE_DEFAULT);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("sales_orders")
    .select(
      "id, brand_id, order_no, contract_type, status, customer_id, customer_name, customer_phone, rs_name, vehicle_model_name, used_brand_model, payment_method, total_amount, deal_price, down_payment, delivery_date, signed_at, fulfilled_at, created_at, updated_at, created_by",
      { count: "exact" },
    )
    .eq("brand_id", scope.brand_id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filter.status) q = q.eq("status", filter.status);
  if (filter.contract_type) q = q.eq("contract_type", filter.contract_type);
  if (filter.q) {
    q = q.or(
      `order_no.ilike.%${filter.q}%,customer_name.ilike.%${filter.q}%`,
    );
  }

  const { data, error, count } = await q;
  if (error) throw error;

  // enrich with customer code
  const customerIds = Array.from(
    new Set((data ?? []).map((r) => r.customer_id).filter(Boolean)),
  ) as string[];
  const customerMap = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: custs } = await supabase
      .from("customers")
      .select("id, code")
      .in("id", customerIds);
    for (const c of custs ?? []) customerMap.set(c.id, c.code);
  }

  const rows: SalesOrderRow[] = (data ?? []).map((r) => ({
    ...r,
    total_amount: r.total_amount != null ? Number(r.total_amount) : null,
    deal_price: r.deal_price != null ? Number(r.deal_price) : null,
    down_payment: r.down_payment != null ? Number(r.down_payment) : null,
    customer_code: r.customer_id ? (customerMap.get(r.customer_id) ?? null) : null,
  }));

  return { rows, totalCount: count ?? 0 };
}

// ─────────────────────────────────────────────────────────────
// Get by ID
// ─────────────────────────────────────────────────────────────

export async function getSalesOrderById(
  id: string,
): Promise<SalesOrderDetail | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("sales_orders")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    total_amount: data.total_amount != null ? Number(data.total_amount) : null,
    deal_price: data.deal_price != null ? Number(data.deal_price) : null,
    down_payment: data.down_payment != null ? Number(data.down_payment) : null,
    quote_snapshot: (data.quote_snapshot as Record<string, unknown>) ?? null,
    metadata: (data.metadata as Record<string, unknown>) ?? {},
    customer_code: null,
  } as SalesOrderDetail;
}

// ─────────────────────────────────────────────────────────────
// Generate order number
// ─────────────────────────────────────────────────────────────

async function genOrderNo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contractType: "new" | "used",
  brandId: string,
): Promise<string> {
  const d = new Date();
  const dateStr =
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
  const prefix = contractType === "new" ? "PO" : "UA";
  const pattern = `${prefix}${dateStr}-%`;

  const { data: last } = await supabase
    .from("sales_orders")
    .select("order_no")
    .eq("brand_id", brandId)
    .like("order_no", pattern)
    .order("order_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  let seq = 1;
  if (last?.order_no) {
    const m = last.order_no.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${dateStr}-${String(seq).padStart(3, "0")}`;
}

// ─────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────

export async function createSalesOrder(
  input: CreateSalesOrderInput,
): Promise<Result<{ id: string; order_no: string }>> {
  if (!input.contract_type) {
    return { ok: false, error: "合約類型必填" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const order_no = await genOrderNo(supabase, input.contract_type, scope.brand_id);

  const { data, error } = await supabase
    .from("sales_orders")
    .insert({
      brand_id: scope.brand_id,
      order_no,
      contract_type: input.contract_type,
      status: "draft",
      customer_id: input.customer_id ?? null,
      customer_name: input.customer_name ?? null,
      customer_phone: input.customer_phone ?? null,
      customer_email: input.customer_email ?? null,
      customer_address: input.customer_address ?? null,
      buyer_national_id: input.buyer_national_id ?? null,
      rs_name: input.rs_name ?? null,
      lead_id: input.lead_id ?? null,
      vehicle_model_id: input.vehicle_model_id ?? null,
      vehicle_model_name: input.vehicle_model_name ?? null,
      vehicle_color: input.vehicle_color ?? null,
      vehicle_vin: input.vehicle_vin ?? null,
      vehicle_engine_no: input.vehicle_engine_no ?? null,
      used_vehicle_id: input.used_vehicle_id ?? null,
      used_brand_model: input.used_brand_model ?? null,
      used_year: input.used_year ?? null,
      used_plate: input.used_plate ?? null,
      used_cc: input.used_cc ?? null,
      used_mileage: input.used_mileage ?? null,
      used_cert_level: input.used_cert_level ?? null,
      payment_method: input.payment_method ?? null,
      total_amount: input.total_amount ?? null,
      down_payment: input.down_payment ?? null,
      deal_price: input.deal_price ?? null,
      delivery_date: input.delivery_date ?? null,
      final_payment_date: input.final_payment_date ?? null,
      transfer_by: input.transfer_by ?? null,
      special_notes: input.special_notes ?? null,
      condition_notes: input.condition_notes ?? null,
      quote_snapshot: input.quote_snapshot ?? {},
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "合約編號重複，請重試" };
    }
    return { ok: false, error: `建立失敗：${error.message}` };
  }

  revalidatePath("/sales/orders");
  return { ok: true, data: { id: data.id, order_no } };
}

// ─────────────────────────────────────────────────────────────
// Update
// ─────────────────────────────────────────────────────────────

export async function updateSalesOrder(
  id: string,
  patch: UpdateSalesOrderInput,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("sales_orders")
    .select("status")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到訂單" };
  if (current.status === "cancelled") {
    return { ok: false, error: "已作廢的訂單不可修改" };
  }

  const { error } = await supabase
    .from("sales_orders")
    .update({ ...patch, updated_by: user?.id ?? null })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `更新失敗：${error.message}` };

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${id}`);
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// Set status
// ─────────────────────────────────────────────────────────────

export async function setSalesOrderStatus(
  id: string,
  status: "signed" | "cancelled" | "fulfilled",
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const extra: Record<string, unknown> = {};
  if (status === "signed") extra.signed_at = new Date().toISOString();
  if (status === "fulfilled") extra.fulfilled_at = new Date().toISOString();

  const { error } = await supabase
    .from("sales_orders")
    .update({ status, ...extra, updated_by: user?.id ?? null })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `狀態更新失敗：${error.message}` };

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${id}`);
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────

export async function deleteSalesOrder(
  id: string,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: current } = await supabase
    .from("sales_orders")
    .select("status")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到訂單" };
  if (current.status === "signed" || current.status === "fulfilled") {
    return { ok: false, error: "已簽約或已交車的訂單不可刪除" };
  }

  const { error } = await supabase
    .from("sales_orders")
    .delete()
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `刪除失敗：${error.message}` };

  revalidatePath("/sales/orders");
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// Form data helpers
// ─────────────────────────────────────────────────────────────

export async function getSalesOrderFormData(): Promise<{
  customers: CustomerPickRow[];
  vehicleModels: VehicleModelPickRow[];
}> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const [custRes, vmRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, code, name, phone, email")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code")
      .limit(500),
    supabase
      .from("vehicle_models")
      .select("id, model_name, display_name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("display_name"),
  ]);

  return {
    customers: (custRes.data ?? []) as CustomerPickRow[],
    vehicleModels: (vmRes.data ?? []) as VehicleModelPickRow[],
  };
}

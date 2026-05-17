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
      "id, brand_id, order_no, contract_type, status, customer_id, customer_name, customer_phone, rs_name, vehicle_model_name, used_brand_model, payment_method, total_amount, deal_price, down_payment, delivery_date, submitted_at, signed_at, fulfilled_at, created_at, updated_at, created_by",
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
// Get for invoice prefill — 給 /einvoice/issue?orderId=xxx 用
// 只回需要的最小欄位（避免 client 收到敏感欄位）
// ─────────────────────────────────────────────────────────────

export type SalesOrderInvoicePrefill = {
  id: string;
  order_no: string;
  contract_type: "new" | "used";
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_tax_id: string | null;       // 從 customers.tax_id join 撈
  customer_national_id: string | null;  // 從 customers.national_id join 撈
  total_amount: number | null;
  items: Array<{ name: string; qty: number; unitPrice: number }>;
  vehicle_model_name: string | null;
  used_brand_model: string | null;
};

export async function getSalesOrderForInvoice(
  id: string,
): Promise<SalesOrderInvoicePrefill | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("sales_orders")
    .select(
      "id, order_no, contract_type, customer_id, customer_name, customer_phone, customer_email, total_amount, deal_price, quote_snapshot, vehicle_model_name, used_brand_model",
    )
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // 撈買家統編 / 身分證（給 b2b / b2c_taxid 預填）
  let customerTaxId: string | null = null;
  let customerNationalId: string | null = null;
  if (data.customer_id) {
    const { data: cust } = await supabase
      .from("customers")
      .select("tax_id, national_id")
      .eq("id", data.customer_id)
      .maybeSingle();
    customerTaxId = cust?.tax_id ?? null;
    customerNationalId = cust?.national_id ?? null;
  }

  // 組品項：先用 quote_snapshot.items（若有 array）、否則用車款 + 總價 fallback
  type QuoteItem = { name?: string; qty?: number; unitPrice?: number; unit_price?: number; amount?: number };
  const rawItems = ((data.quote_snapshot as { items?: QuoteItem[] } | null)?.items ?? []) as QuoteItem[];
  const totalAmount =
    data.total_amount != null
      ? Number(data.total_amount)
      : data.deal_price != null
        ? Number(data.deal_price)
        : null;

  let items: SalesOrderInvoicePrefill["items"] = [];
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    items = rawItems
      .map((it) => ({
        name: String(it.name ?? "").trim() || "—",
        qty: Number(it.qty ?? 1) || 1,
        unitPrice: Number(it.unitPrice ?? it.unit_price ?? it.amount ?? 0) || 0,
      }))
      .filter((it) => it.name && it.unitPrice >= 0);
  }
  if (items.length === 0) {
    // fallback：合約 1 行（車款 + 總金額）
    const fallbackName =
      data.contract_type === "used"
        ? (data.used_brand_model ?? "中古車交易")
        : (data.vehicle_model_name ?? "新車交易");
    items = [
      {
        name: `${fallbackName}（${data.order_no}）`,
        qty: 1,
        unitPrice: totalAmount ?? 0,
      },
    ];
  }

  return {
    id: data.id,
    order_no: data.order_no,
    contract_type: data.contract_type as "new" | "used",
    customer_name: data.customer_name,
    customer_phone: data.customer_phone,
    customer_email: data.customer_email,
    customer_tax_id: customerTaxId,
    customer_national_id: customerNationalId,
    total_amount: totalAmount,
    items,
    vehicle_model_name: data.vehicle_model_name,
    used_brand_model: data.used_brand_model,
  };
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
//
// 中古成交 hook（GAP-07 修正）：
//   - status='signed'    且 used_vehicle_id 非 null → used_car_inventory.status='reserved'
//   - status='fulfilled' 且 used_vehicle_id 非 null → used_car_inventory.status='sold' + sold_date=today
//   - status='cancelled' 且原訂單已掛中古車 → used_car_inventory.status='available'（回滾）
//
// 二賣保護：
//   - DB 層 partial unique index `sales_orders_used_vehicle_active_uniq`
//     ON (used_vehicle_id) WHERE status IN ('signed','fulfilled')
//   - 同一台中古車已掛 active 訂單時，第二張 signed/fulfilled 會被 23505 擋下、轉成人話錯誤回給 UI
// ─────────────────────────────────────────────────────────────

export async function setSalesOrderStatus(
  id: string,
  status: "submitted" | "signed" | "cancelled" | "fulfilled",
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 先抓現況：要拿 used_vehicle_id 跟舊 status 做後續中古車同步決策
  const { data: current } = await supabase
    .from("sales_orders")
    .select("status, used_vehicle_id")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到訂單" };

  const extra: Record<string, unknown> = {};
  if (status === "submitted") extra.submitted_at = new Date().toISOString();
  if (status === "signed") extra.signed_at = new Date().toISOString();
  if (status === "fulfilled") extra.fulfilled_at = new Date().toISOString();

  const { error } = await supabase
    .from("sales_orders")
    .update({ status, ...extra, updated_by: user?.id ?? null })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) {
    // partial unique index 撞到 → 同台中古車已掛另一張 active 訂單
    if (error.code === "23505" && /sales_orders_used_vehicle_active_uniq/.test(error.message)) {
      return {
        ok: false,
        error: "這台中古車已掛在另一張已簽約 / 已交車的訂單上，請先取消另一張訂單再來。",
      };
    }
    return { ok: false, error: `狀態更新失敗：${error.message}` };
  }

  // ── 中古成交 hook：同步 used_car_inventory.status ──
  if (current.used_vehicle_id) {
    let nextUsedStatus: "available" | "reserved" | "sold" | null = null;
    const patch: Record<string, unknown> = {};

    if (status === "signed") {
      nextUsedStatus = "reserved";
    } else if (status === "fulfilled") {
      nextUsedStatus = "sold";
      patch.sold_date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    } else if (status === "cancelled" && (current.status === "signed" || current.status === "fulfilled")) {
      // 已經寫到中古車的狀態才需要回滾；draft → cancelled 不會碰中古車
      nextUsedStatus = "available";
      patch.sold_date = null;
    }

    if (nextUsedStatus) {
      patch.status = nextUsedStatus;
      const { error: usedErr } = await supabase
        .from("used_car_inventory")
        .update(patch)
        .eq("id", current.used_vehicle_id);
      // 不 rollback sales_orders（POC 階段）— 但回報 error 讓 UI 顯示警告
      if (usedErr) {
        return {
          ok: false,
          error: `訂單狀態已更新，但中古車庫存狀態同步失敗：${usedErr.message}`,
        };
      }
      // revalidate 中古車相關頁面
      revalidatePath("/usedcar/stock");
      revalidatePath("/sales/showroom/used-cars");
    }
  }

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
// Submit for approval（送簽）
//
// draft → submitted；validate 必填欄位齊全：
//   - customer_id 或 customer_name 至少一個
//   - contract_type 新車：vehicle_model_id 或 vehicle_model_name；中古：used_brand_model
//   - total_amount 或 deal_price 至少一個 > 0
// ─────────────────────────────────────────────────────────────

export async function submitSalesOrderForApproval(
  id: string,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("sales_orders")
    .select(
      "status, contract_type, customer_id, customer_name, vehicle_model_id, vehicle_model_name, used_brand_model, total_amount, deal_price",
    )
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到訂單" };
  if (current.status !== "draft") {
    return {
      ok: false,
      error: `只有草稿狀態的訂單可送簽，目前狀態：${current.status}`,
    };
  }

  // Validation
  if (!current.customer_id && !current.customer_name) {
    return { ok: false, error: "送簽前請先填寫買受人資料" };
  }
  if (current.contract_type === "new") {
    if (!current.vehicle_model_id && !current.vehicle_model_name) {
      return { ok: false, error: "送簽前請先選擇車款" };
    }
  } else if (current.contract_type === "used") {
    if (!current.used_brand_model) {
      return { ok: false, error: "送簽前請先填寫中古車廠牌/車款" };
    }
  }
  const amount = Number(current.total_amount ?? current.deal_price ?? 0);
  if (!(amount > 0)) {
    return { ok: false, error: "送簽前請先填寫金額" };
  }

  const { error } = await supabase
    .from("sales_orders")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `送簽失敗：${error.message}` };

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${id}`);
  revalidatePath("/admin/approvals/order");
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// Approve / Reject（簽核）
//
// approve: submitted → signed（同樣會觸發 setSalesOrderStatus 的中古車 hook）
// reject:  submitted → cancelled（記錄理由）
// ─────────────────────────────────────────────────────────────

export async function approveSalesOrder(
  id: string,
  note?: string | null,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("sales_orders")
    .select("status, used_vehicle_id")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到訂單" };
  if (current.status !== "submitted") {
    return {
      ok: false,
      error: `只有送簽中的訂單可簽核，目前狀態：${current.status}`,
    };
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("sales_orders")
    .update({
      status: "signed",
      signed_at: nowIso,
      reviewed_at: nowIso,
      reviewed_by: user?.id ?? null,
      review_note: note ?? null,
      updated_by: user?.id ?? null,
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) {
    if (error.code === "23505" && /sales_orders_used_vehicle_active_uniq/.test(error.message)) {
      return {
        ok: false,
        error: "這台中古車已掛在另一張已簽約 / 已交車的訂單上，請先取消另一張訂單再來。",
      };
    }
    return { ok: false, error: `簽核失敗：${error.message}` };
  }

  // 中古車 hook：approve 後同步 used_car_inventory.status='reserved'
  if (current.used_vehicle_id) {
    const { error: usedErr } = await supabase
      .from("used_car_inventory")
      .update({ status: "reserved" })
      .eq("id", current.used_vehicle_id);
    if (usedErr) {
      return {
        ok: false,
        error: `訂單已簽核，但中古車庫存狀態同步失敗：${usedErr.message}`,
      };
    }
    revalidatePath("/usedcar/stock");
    revalidatePath("/sales/showroom/used-cars");
  }

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${id}`);
  revalidatePath("/admin/approvals/order");
  return { ok: true, data: { id } };
}

export async function rejectSalesOrder(
  id: string,
  note?: string | null,
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
  if (current.status !== "submitted") {
    return {
      ok: false,
      error: `只有送簽中的訂單可駁回，目前狀態：${current.status}`,
    };
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("sales_orders")
    .update({
      status: "cancelled",
      reviewed_at: nowIso,
      reviewed_by: user?.id ?? null,
      review_note: note ?? null,
      updated_by: user?.id ?? null,
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `駁回失敗：${error.message}` };

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${id}`);
  revalidatePath("/admin/approvals/order");
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// List pending approvals — 給 /admin/approvals/order 用
// 只列 status='submitted' 的訂單，依 submitted_at 由舊到新（先進先審）
// ─────────────────────────────────────────────────────────────

export async function listPendingApprovalOrders(): Promise<SalesOrderRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("sales_orders")
    .select(
      "id, brand_id, order_no, contract_type, status, customer_id, customer_name, customer_phone, rs_name, vehicle_model_name, used_brand_model, payment_method, total_amount, deal_price, down_payment, delivery_date, submitted_at, signed_at, fulfilled_at, created_at, updated_at, created_by",
    )
    .eq("brand_id", scope.brand_id)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true, nullsFirst: false });

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

  return (data ?? []).map((r) => ({
    ...r,
    total_amount: r.total_amount != null ? Number(r.total_amount) : null,
    deal_price: r.deal_price != null ? Number(r.deal_price) : null,
    down_payment: r.down_payment != null ? Number(r.down_payment) : null,
    customer_code: r.customer_id ? (customerMap.get(r.customer_id) ?? null) : null,
  })) as SalesOrderRow[];
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

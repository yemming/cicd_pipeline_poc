import "server-only";

/**
 * Domain Helper — Sales Orders（成交訂單合約書）
 *
 * RS04 新車訂購合約書 + 中古車買賣切結合約書
 * UI 嚴禁直接 import @/lib/supabase；所有讀寫透過此 helper。
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getBrandConfig } from "@/domain/brand-config";
import type {
  Result,
  SalesOrderRow,
  SalesOrderDetail,
  CreateSalesOrderInput,
  UpdateSalesOrderInput,
  ListSalesOrdersFilter,
  CustomerPickRow,
  VehicleModelPickRow,
  SalesOrderKpis,
  SalesOrderStatusBreakdown,
  CancelOrderInput,
  DeferDeliveryInput,
  UsedCarPostDeliveryDisputeInput,
  ReplaceNewCarInput,
  CancelReasonCode,
  UpdateFinancingInput,
  ReassignOrderInput,
} from "./sales-orders.constants";
import { REVIEW_PERIOD_DAYS } from "./sales-orders.constants";
export { FINANCING_STATUS_LABELS, FINANCING_STATUS_CHIP, FINANCING_STATUSES } from "./sales-orders.constants";
import { writeAuditLog } from "./audit-logs";
import { checkSalesDiscountAuthority, createDiscountApproval } from "./discount-approvals";

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
  SalesOrderKpis,
  SalesOrderStatusBreakdown,
  CancelOrderInput,
  DeferDeliveryInput,
  UsedCarPostDeliveryDisputeInput,
  ReplaceNewCarInput,
  CancelReasonCode,
  SalesOrderCancelFields,
  ReplaceCarThresholds,
  UpdateFinancingInput,
  ReassignOrderInput,
  RecordOrderPaymentInput,
  FinancingStatus,
} from "./sales-orders.constants";

export const ORDERS_PAGE_SIZE_DEFAULT = 50;

// ─────────────────────────────────────────────────────────────
// KPI / Funnel — A 級升級（2026-05-20，M01-8）
// ─────────────────────────────────────────────────────────────

export async function getSalesOrderKpis(): Promise<SalesOrderKpis> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const [monthlyRes, pendingDeliveryRes, fulfilledRes, pendingApprovalRes] =
    await Promise.all([
      supabase
        .from("sales_orders")
        .select("total_amount, deal_price", { count: "exact" })
        .eq("brand_id", scope.brand_id)
        .gte("created_at", `${monthStart}T00:00:00Z`)
        .lte("created_at", `${monthEnd}T23:59:59Z`),
      supabase
        .from("sales_orders")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", scope.brand_id)
        .eq("status", "signed"),
      supabase
        .from("sales_orders")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", scope.brand_id)
        .eq("status", "fulfilled")
        .gte("fulfilled_at", `${monthStart}T00:00:00Z`)
        .lte("fulfilled_at", `${monthEnd}T23:59:59Z`),
      supabase
        .from("sales_orders")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", scope.brand_id)
        .eq("status", "submitted"),
    ]);

  const rows = (monthlyRes.data ?? []) as Array<{
    total_amount: number | null;
    deal_price: number | null;
  }>;
  const monthlyAmount = rows.reduce(
    (sum, r) => sum + (Number(r.total_amount ?? r.deal_price) || 0),
    0,
  );

  return {
    monthly_count: monthlyRes.count ?? 0,
    monthly_amount: monthlyAmount,
    pending_delivery_count: pendingDeliveryRes.count ?? 0,
    fulfilled_this_month: fulfilledRes.count ?? 0,
    pending_approval_count: pendingApprovalRes.count ?? 0,
  };
}

export async function getSalesOrderStatusBreakdown(): Promise<
  SalesOrderStatusBreakdown[]
> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("sales_orders")
    .select("status")
    .eq("brand_id", scope.brand_id);

  if (error) {
    console.error(
      "[sales-orders] getSalesOrderStatusBreakdown failed:",
      error.message,
    );
    return [];
  }

  const counts = new Map<SalesOrderStatusBreakdown["status"], number>();
  for (const r of data ?? []) {
    const s = r.status as SalesOrderStatusBreakdown["status"];
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return (
    ["draft", "submitted", "signed", "fulfilled", "cancelled"] as const
  ).map((s) => ({ status: s, count: counts.get(s) ?? 0 }));
}

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
    list_price: data.list_price != null ? Number(data.list_price) : null,
    discount_pct: data.discount_pct != null ? Number(data.discount_pct) : null,
    discount_amount: data.discount_amount != null ? Number(data.discount_amount) : null,
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
): Promise<Result<{ id: string; order_no: string; needs_approval: boolean }>> {
  if (!input.contract_type) {
    return { ok: false, error: "合約類型必填" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const order_no = await genOrderNo(supabase, input.contract_type, scope.brand_id);

  // B-3 負值差價前置驗證
  if (
    input.contract_type === "new" &&
    input.trade_in_linked_order_id &&
    input.total_amount != null &&
    input.deal_price != null
  ) {
    // trade_in_balance = deal_price - used_vehicle_price；
    // 若 input 帶 negative_equity_resolution 表示 wizard 已確認，直接放行
    // 若差價為負但沒有 negative_equity_resolution → 攔截
    const tradeInPrice = (input as { _tradeInPrice?: number })._tradeInPrice ?? 0;
    const balance = (input.deal_price ?? 0) - tradeInPrice;
    if (balance < 0 && !input.negative_equity_resolution) {
      return {
        ok: false,
        error: "以舊換新差價為負值，請選擇差價處理方式（併入車價 / 現金補差）後再送出",
      };
    }
  }

  // RS04（2026-07-03 Russell 裁示）：折扣審核唯一觸發點 — 不論業務員從報價單轉單
  // 或直接建訂單，一律在這裡（createSalesOrder）判斷折扣授權，沒有繞過的路徑。
  // 折扣% = (list_price - 成交價) / list_price；沒帶 list_price 視為無折扣（situation A）。
  const listPrice = input.list_price ?? null;
  const dealPrice = input.deal_price ?? input.total_amount ?? null;
  let discountAmount = 0;
  let discountPct = 0;
  if (listPrice != null && listPrice > 0 && dealPrice != null) {
    discountAmount = Math.max(0, listPrice - dealPrice);
    discountPct = (discountAmount / listPrice) * 100;
  }

  const authority = await checkSalesDiscountAuthority(discountPct);

  if (authority.situation === "exceeds_top") {
    return {
      ok: false,
      error: `折扣 ${discountPct.toFixed(1)}% 超過店長授權上限（${authority.top_max_pct}%），請重新協商折扣後再送出。`,
    };
  }

  const needsApproval = authority.situation === "B";

  const { data, error } = await supabase
    .from("sales_orders")
    .insert({
      brand_id: scope.brand_id,
      order_no,
      contract_type: input.contract_type,
      status: needsApproval ? "pending_discount_approval" : "draft",
      list_price: listPrice,
      discount_pct: discountAmount > 0 ? discountPct : null,
      discount_amount: discountAmount > 0 ? discountAmount : null,
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
      new_vehicle_id: input.new_vehicle_id ?? null,
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
      negative_equity_resolution: input.negative_equity_resolution ?? null,
      trade_in_linked_order_id: input.trade_in_linked_order_id ?? null,
      financing_status: input.financing_status ?? null,
      financing_applied_at: input.financing_applied_at ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // 區分新車二賣鎖 vs 合約編號重複
      if (/sales_orders_new_vehicle_active_uniq/.test(error.message)) {
        return {
          ok: false,
          error: "這台新車已掛在另一張有效訂單上，請先取消另一張訂單或選擇其他車輛。",
        };
      }
      return { ok: false, error: "合約編號重複，請重試" };
    }
    return { ok: false, error: `建立失敗：${error.message}` };
  }

  // B-3：若選擇了新車庫存，預留該車
  // 情況A（無需送審）→ status: reserved；情況B（需送審）→ status: frozen（其他業務員不可再配對）
  // A1 demo 車 guard：is_demo_unit=true 的車不得進入一般新車銷售流程
  if (input.new_vehicle_id) {
    // 先驗 demo 車排除（用 .eq('is_demo_unit', false) 做條件式 guard）
    const { data: nvCheck } = await supabase
      .from("new_car_inventory")
      .select("id, is_demo_unit")
      .eq("id", input.new_vehicle_id)
      .eq("brand_id", scope.brand_id)
      .single();
    if (nvCheck?.is_demo_unit) {
      await supabase.from("sales_orders").delete().eq("id", data.id);
      return { ok: false, error: "這台是 demo 展示車，無法配一般新車銷售訂單。請選擇非 demo 庫存車輛。" };
    }

    // 車輛可售狀態只有 "displayed"（現車可售）；舊版誤寫 "available"（不存在的值）
    // 導致 .update() 永遠 0 rows 命中卻不回 error，預留形同虛設 — 這裡改用 .select() 判斷實際命中數。
    const targetStatus = needsApproval ? "frozen" : "reserved";
    const { data: nvUpdated, error: nvErr } = await supabase
      .from("new_car_inventory")
      .update({
        status: targetStatus,
        linked_sales_order_id: data.id,
        ...(targetStatus === "reserved" ? { reserved_date: new Date().toISOString() } : {}),
      })
      .eq("id", input.new_vehicle_id)
      .eq("status", "displayed")
      .eq("is_demo_unit", false) // A1：demo 車不可被一般訂單配對（雙重保險）
      .select("id");
    if (nvErr || !nvUpdated || nvUpdated.length === 0) {
      // 若失敗（競態被搶、或該車已非可售狀態），清掉訂單並回錯
      await supabase.from("sales_orders").delete().eq("id", data.id);
      return { ok: false, error: "這台新車已被其他訂單預留，請選擇其他車輛。" };
    }
  }

  // 情況B：超過業務員授權、在店長授權內 → 建立折扣審核申請，通知店長
  if (needsApproval) {
    const approvalRes = await createDiscountApproval({
      order_id: data.id,
      discount_pct: discountPct,
      discount_amount: discountAmount,
      in_store_waiting: input.in_store_waiting ?? true,
      vehicle_amount: dealPrice ?? undefined,
      vehicle_model_name: input.vehicle_model_name ?? undefined,
      notes: input.special_notes ?? undefined,
    });
    if (!approvalRes.ok) {
      // 送審失敗 → 訂單與車輛都要復原，不留半成品狀態
      await supabase.from("sales_orders").delete().eq("id", data.id);
      if (input.new_vehicle_id) {
        await supabase
          .from("new_car_inventory")
          .update({ status: "displayed", linked_sales_order_id: null })
          .eq("id", input.new_vehicle_id)
          .eq("status", "frozen");
      }
      return { ok: false, error: `建立訂單失敗：${approvalRes.error}` };
    }
  }

  revalidatePath("/sales/orders");
  return { ok: true, data: { id: data.id, order_no, needs_approval: needsApproval } };
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
// 跨模組 hook #3：交車（sales_orders fulfilled）→ 啟動車輛保固
//
// 算 customer_vehicles.warranty_until = 交車日 + vehicle_models.warranty_months 個月，
// upsert 該客戶的車輛主檔。
//   - 僅「新車」交車啟保固（used_vehicle_id 非 null 的中古車有自己的 hook，且不啟原廠保固）
//   - 冪等：以 customer_vehicles.metadata->>'warranty_source_order' 記來源訂單；
//     已啟動過（含「已啟動但起算日更早」）就不覆蓋，防 fulfilled 切兩次 / 取消再 fulfilled
//   - 非阻塞：由 caller after() 包，失敗只 log、不回滾交車
// ─────────────────────────────────────────────────────────────

function addMonthsToDate(isoDate: string, months: number): string {
  // isoDate: 'YYYY-MM-DD'；回傳同格式。用 UTC 月份相加避開時區漂移。
  const [y, m, d] = isoDate.split("-").map((v) => parseInt(v, 10));
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCMonth(base.getUTCMonth() + months);
  return base.toISOString().slice(0, 10);
}

export async function startVehicleWarranty(
  salesOrderId: string,
): Promise<{ ok: true; data: { skipped?: true; vehicle_id?: string } } | { ok: false; error: string }> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 1. 撈訂單的車輛資料
  const { data: order, error: orderErr } = await supabase
    .from("sales_orders")
    .select(
      "id, customer_id, vehicle_model_id, vehicle_vin, vehicle_color, vehicle_engine_no, used_vehicle_id, fulfilled_at, delivery_date",
    )
    .eq("id", salesOrderId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (orderErr) return { ok: false, error: orderErr.message };
  if (!order) return { ok: false, error: "找不到訂單" };

  // 僅新車交車啟保固（中古車 used_vehicle_id 非 null → 跳過）
  if (order.used_vehicle_id) return { ok: true, data: { skipped: true } };
  if (!order.customer_id || !order.vehicle_model_id) {
    return { ok: true, data: { skipped: true } };
  }

  // 2. 保固期長度：vehicle_models.warranty_months（typed 欄位，POC 預設 24）
  const { data: model, error: modelErr } = await supabase
    .from("vehicle_models")
    .select("warranty_months")
    .eq("id", order.vehicle_model_id)
    .maybeSingle();
  if (modelErr) return { ok: false, error: modelErr.message };
  const warrantyMonths = model?.warranty_months ?? 24;

  // 3. 起算日 = 交車日（fulfilled_at 優先，否則 delivery_date，否則今天）
  const deliveredIso =
    (order.fulfilled_at ? order.fulfilled_at.slice(0, 10) : null) ??
    order.delivery_date ??
    new Date().toISOString().slice(0, 10);
  const warrantyUntil = addMonthsToDate(deliveredIso, warrantyMonths);

  // 4. 冪等：這張訂單已啟動過保固就 skip（不覆蓋更早的起算）
  const { data: alreadyStarted, error: dupErr } = await supabase
    .from("customer_vehicles")
    .select("id")
    .eq("brand_id", brand)
    .eq("metadata->>warranty_source_order", salesOrderId)
    .limit(1)
    .maybeSingle();
  if (dupErr) return { ok: false, error: dupErr.message };
  if (alreadyStarted) return { ok: true, data: { skipped: true } };

  // 5. 找該客戶既有車輛（以 VIN 對；無 VIN 則以 customer+model）→ upsert
  let existingVehicleId: string | null = null;
  if (order.vehicle_vin) {
    const { data: byVin } = await supabase
      .from("customer_vehicles")
      .select("id")
      .eq("brand_id", brand)
      .eq("customer_id", order.customer_id)
      .eq("vin", order.vehicle_vin)
      .limit(1)
      .maybeSingle();
    existingVehicleId = byVin?.id ?? null;
  }

  const warrantyMeta = {
    warranty_source_order: salesOrderId,
    warranty_started_at: deliveredIso,
    warranty_months: warrantyMonths,
  };

  if (existingVehicleId) {
    // 既有車 → 更新保固欄 + merge metadata
    const { data: cur } = await supabase
      .from("customer_vehicles")
      .select("metadata")
      .eq("id", existingVehicleId)
      .maybeSingle();
    const mergedMeta = {
      ...((cur?.metadata as Record<string, unknown> | null) ?? {}),
      ...warrantyMeta,
    };
    const { error: updErr } = await supabase
      .from("customer_vehicles")
      .update({
        warranty_until: warrantyUntil,
        purchase_date: deliveredIso,
        metadata: mergedMeta,
      })
      .eq("id", existingVehicleId)
      .eq("brand_id", brand);
    if (updErr) return { ok: false, error: updErr.message };
    return { ok: true, data: { vehicle_id: existingVehicleId } };
  }

  // 找不到既有車 → 建新車輛主檔
  const { data: inserted, error: insErr } = await supabase
    .from("customer_vehicles")
    .insert({
      brand_id: brand,
      customer_id: order.customer_id,
      model_id: order.vehicle_model_id,
      vin: order.vehicle_vin ?? null,
      color: order.vehicle_color ?? null,
      engine_no: order.vehicle_engine_no ?? null,
      acquired_from: "new",
      purchase_date: deliveredIso,
      warranty_until: warrantyUntil,
      external_source: "manual",
      metadata: warrantyMeta,
    })
    .select("id")
    .single();
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true, data: { vehicle_id: inserted.id } };
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

  // 先抓現況：要拿 used_vehicle_id, new_vehicle_id 跟舊 status 做後續庫存同步決策
  const { data: current } = await supabase
    .from("sales_orders")
    .select("status, used_vehicle_id, new_vehicle_id, order_no, total_amount, deal_price, down_payment, payment_method, contract_type, rs_name")
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

  // ── 新車庫存 hook：同步 new_car_inventory.status ──
  const newVehicleId = (current.new_vehicle_id as string | null);
  if (newVehicleId) {
    let newCarStatus: "reserved" | "sold" | "available" | null = null;
    const newCarPatch: Record<string, unknown> = {};
    if (status === "signed") {
      newCarStatus = "reserved";
      newCarPatch.linked_sales_order_id = id;
    } else if (status === "fulfilled") {
      newCarStatus = "sold";
    } else if (status === "cancelled" && (current.status === "signed" || current.status === "fulfilled")) {
      newCarStatus = "available";
      newCarPatch.linked_sales_order_id = null;
    }

    if (newCarStatus) {
      newCarPatch.status = newCarStatus;
      const { error: ncErr } = await supabase
        .from("new_car_inventory")
        .update(newCarPatch)
        .eq("id", newVehicleId);
      if (ncErr) {
        console.error("[setSalesOrderStatus] 新車庫存狀態同步失敗", ncErr.message);
        // 不 rollback，只 log（POC 階段）
      }
    }
  }

  // ── 跨模組 hook #3：交車 → 啟動保固（非阻塞、失敗不回滾交車）──
  if (status === "fulfilled") {
    after(async () => {
      try {
        const res = await startVehicleWarranty(id);
        if (!res.ok) {
          console.error("[hook#3 交車→保固] 啟動失敗（不影響交車）", res.error);
        }
      } catch (e) {
        console.error("[hook#3 交車→保固] 副作用例外（不影響交車）", e);
      }
    });
  }

  // ── 金流 wiring：簽約 / 交車完成時寫 sales_payments（非阻塞）──
  if (status === "signed" || status === "fulfilled") {
    after(async () => {
      try {
        await _recordOrderPaymentOnStatusChange(id, status, current);
      } catch (e) {
        console.error("[setSalesOrderStatus] 金流記錄失敗（不影響狀態變更）", e);
      }
    });
  }

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${id}`);
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// 內部 helper：狀態變更時自動寫 sales_payments（非阻塞 after() 包）
//
// 規則（輪5-9）：
//  - 成交（signed）時：
//      新車   → createSalesPayment(source_type='new_vehicle_sale', amount=total_amount)
//      中古車 → createSalesPayment(source_type='used_vehicle_sale', amount=deal_price)
//      以舊換新 → recordTradeInSplit(新車價, 舊車收購價, 差額)
//  - 交車完成（fulfilled）：如果 signed 時已記帳就跳過（冪等）
// ─────────────────────────────────────────────────────────────

async function _recordOrderPaymentOnStatusChange(
  orderId: string,
  status: "signed" | "fulfilled",
  current: {
    status: string;
    order_no?: string;
    total_amount?: unknown;
    deal_price?: unknown;
    down_payment?: unknown;
    payment_method?: unknown;
    contract_type?: string;
    rs_name?: unknown;
  },
): Promise<void> {
  // 只在 signed 時記帳（fulfilled 時不重複計帳）
  if (status !== "signed") return;

  const { createSalesPayment, recordTradeInSplit } = await import("./sales-payments");

  // 取訂單更多欄位
  const supabase = await createClient();
  const { data: ord } = await supabase
    .from("sales_orders")
    .select("order_no, total_amount, deal_price, down_payment, payment_method, contract_type, trade_in_linked_order_id, negative_equity_resolution")
    .eq("id", orderId)
    .maybeSingle();
  if (!ord) return;

  const paymentMethod = (ord.payment_method as string | null) ?? "cash";
  const orderNo = (ord.order_no as string) ?? "";
  const contractType = (ord.contract_type as string) ?? "new";
  const totalAmount = Number(ord.total_amount ?? ord.deal_price ?? 0);
  const downPayment = Number(ord.down_payment ?? 0);
  const tradeInLinked = ord.trade_in_linked_order_id as string | null;

  // 冪等：如果已有這張訂單的 payment 記錄就跳過
  const { count: existingCount } = await supabase
    .from("sales_payments")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  if ((existingCount ?? 0) > 0) return; // 已記帳，跳過

  if (contractType === "new" && tradeInLinked) {
    // 以舊換新：從 used purchase request 或 trade_in_linked_order 撈舊車收購價
    const { data: tradeInOrd } = await supabase
      .from("sales_orders")
      .select("deal_price, total_amount")
      .eq("id", tradeInLinked)
      .maybeSingle();
    const tradeInPrice = Math.abs(Number(tradeInOrd?.deal_price ?? tradeInOrd?.total_amount ?? 0));
    if (tradeInPrice > 0) {
      await recordTradeInSplit({
        orderId,
        orderNo,
        newVehiclePrice: totalAmount,
        tradeInPrice,
        paymentMethod,
        metadata: { source: "auto_on_signed" },
      });
      return;
    }
    // fallback：舊車價撈不到就走普通新車
  }

  // 普通新車或中古車
  const sourceType = contractType === "used" ? "used_vehicle_sale" : "new_vehicle_sale";
  const amount = downPayment > 0 ? downPayment : totalAmount; // 有訂金就先記訂金
  await createSalesPayment({
    order_id: orderId,
    order_no: orderNo,
    source_type: sourceType,
    total_amount: amount,
    payment_method: paymentMethod,
    metadata: { source: "auto_on_signed", is_down_payment: downPayment > 0 },
  });
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

// ─────────────────────────────────────────────────────────────
// 列印 — getSalesOrderForPrint(id)
//
// 跟 detail 不同：除了單頭，還要撈
//   - subsidiary（賣方法人 letterhead；DealerOS 的「公司本體」）
//   - customer 完整 contact（電話 / 地址 / 統編 / Email）
//   - quote_snapshot.items 拆成明細行（沒有 line table，全靠 jsonb）
// 一支 helper 一次撈乾淨、print page 不要自己拼 query。
// ─────────────────────────────────────────────────────────────

export type SalesOrderForPrint = {
  /** sales_orders.id (uuid)，給 /api/pdf/sales-order/{id} 用 */
  id: string;
  // 賣方（公司 letterhead）
  buyer: {
    legalName: string;
    taxId: string | null;
    address: string | null;
    phone: string | null;
    responsible: string | null;
  };
  brand: { key: string; displayName: string };

  // 買方（客戶）
  customer: {
    code: string | null;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    taxId: string | null;
    nationalId: string | null;
  };

  // 單頭
  orderNo: string;
  orderDate: string | null; // created_at -> YYYY-MM-DD
  contractType: "new" | "used";
  status: string;
  paymentMethod: string | null;
  deliveryDate: string | null;
  finalPaymentDate: string | null;
  rsName: string | null;
  transferBy: string | null;
  signedAt: string | null;
  fulfilledAt: string | null;

  // 車輛資訊（新車 / 中古車二擇一有值）
  vehicle: {
    modelName: string | null;     // 新車型號
    color: string | null;
    vin: string | null;
    engineNo: string | null;
    usedBrandModel: string | null; // 中古車廠牌/車款
    usedYear: string | null;
    usedPlate: string | null;
    usedCc: string | null;
    usedMileage: string | null;
    usedCertLevel: string | null;
  };

  // 明細（從 quote_snapshot.items 解出；無 items 時 fallback 一行）
  lines: Array<{
    lineNo: number;
    itemName: string;
    qty: number;
    unitPrice: number;
    total: number;
    notes: string | null;
  }>;

  // 總計
  totalAmount: number;
  downPayment: number | null;
  finalPayment: number | null;
  specialNotes: string | null;
  conditionNotes: string | null;
};

export async function getSalesOrderForPrint(
  id: string,
): Promise<SalesOrderForPrint | null> {
  const detail = await getSalesOrderById(id);
  if (!detail) return null;

  const supabase = await createClient();
  const scope = await getActiveScope();
  const brandCfg = await getBrandConfig(scope.brand_id);
  const brandName = brandCfg.brandName ?? scope.brand_id;

  const [subsRes, custRes] = await Promise.all([
    supabase
      .from("subsidiaries")
      .select("legal_name, tax_id, address, phone, responsible_person")
      .eq("id", scope.subsidiary_id)
      .maybeSingle(),
    detail.customer_id
      ? supabase
          .from("customers")
          .select("code, name, phone, email, address, tax_id, national_id")
          .eq("id", detail.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as const),
  ]);

  // 解 quote_snapshot.items
  type QuoteItem = {
    name?: string;
    qty?: number;
    unitPrice?: number;
    unit_price?: number;
    amount?: number;
    notes?: string | null;
  };
  const rawItems = ((detail.quote_snapshot as { items?: QuoteItem[] } | null)
    ?.items ?? []) as QuoteItem[];

  const totalAmount = Number(detail.total_amount ?? detail.deal_price ?? 0);

  let lines: SalesOrderForPrint["lines"] = [];
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    lines = rawItems.map((it, idx) => {
      const qty = Number(it.qty ?? 1) || 1;
      const unitPrice =
        Number(it.unitPrice ?? it.unit_price ?? it.amount ?? 0) || 0;
      return {
        lineNo: idx + 1,
        itemName: String(it.name ?? "").trim() || "—",
        qty,
        unitPrice,
        total: qty * unitPrice,
        notes: it.notes ?? null,
      };
    });
  }
  if (lines.length === 0) {
    const fallbackName =
      detail.contract_type === "used"
        ? (detail.used_brand_model ?? "中古車交易")
        : (detail.vehicle_model_name ?? "新車交易");
    lines = [
      {
        lineNo: 1,
        itemName: fallbackName,
        qty: 1,
        unitPrice: totalAmount,
        total: totalAmount,
        notes: null,
      },
    ];
  }

  const downPayment =
    detail.down_payment != null ? Number(detail.down_payment) : null;
  const finalPayment =
    downPayment != null ? Math.max(totalAmount - downPayment, 0) : null;

  return {
    id: detail.id,
    buyer: {
      legalName: subsRes.data?.legal_name ?? "—",
      taxId: subsRes.data?.tax_id ?? null,
      address: subsRes.data?.address ?? null,
      phone: subsRes.data?.phone ?? null,
      responsible: subsRes.data?.responsible_person ?? null,
    },
    brand: {
      key: scope.brand_id,
      displayName: brandName,
    },
    customer: {
      code: custRes.data?.code ?? null,
      name: custRes.data?.name ?? detail.customer_name ?? "—",
      phone: custRes.data?.phone ?? detail.customer_phone ?? null,
      email: custRes.data?.email ?? detail.customer_email ?? null,
      address: custRes.data?.address ?? detail.customer_address ?? null,
      taxId: custRes.data?.tax_id ?? null,
      nationalId: custRes.data?.national_id ?? detail.buyer_national_id ?? null,
    },
    orderNo: detail.order_no,
    orderDate: detail.created_at ? detail.created_at.slice(0, 10) : null,
    contractType: detail.contract_type,
    status: detail.status,
    paymentMethod: detail.payment_method,
    deliveryDate: detail.delivery_date,
    finalPaymentDate: detail.final_payment_date,
    rsName: detail.rs_name,
    transferBy: detail.transfer_by,
    signedAt: detail.signed_at,
    fulfilledAt: detail.fulfilled_at,
    vehicle: {
      modelName: detail.vehicle_model_name,
      color: detail.vehicle_color,
      vin: detail.vehicle_vin,
      engineNo: detail.vehicle_engine_no,
      usedBrandModel: detail.used_brand_model,
      usedYear: detail.used_year,
      usedPlate: detail.used_plate,
      usedCc: detail.used_cc,
      usedMileage: detail.used_mileage,
      usedCertLevel: detail.used_cert_level,
    },
    lines,
    totalAmount,
    downPayment,
    finalPayment,
    specialNotes: detail.special_notes,
    conditionNotes: detail.condition_notes,
  };
}

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

// ─────────────────────────────────────────────────────────────
// RS04 Stage 1 — 結構化取消（輪10-1/2/3/4）
//
// 流程：
//  1. 算審閱期是否在期內（signed_at + review_period_days）
//  2. 期內取消：強制退款 100%（forfeit_rate = 0），鎖定前端輸入
//  3. 期後取消：主管才可裁量 forfeit_rate 0~10%，必填 forfeit_reason
//  4. 同 transaction：訂單 cancelled + 庫存恢復
// ─────────────────────────────────────────────────────────────

/** 計算審閱期是否超過（true = 已過期，false = 仍在期內） */
function isReviewPeriodExpired(signedAt: string, reviewPeriodDays: number): boolean {
  const signedDate = new Date(signedAt);
  const expiresAt = new Date(signedDate);
  expiresAt.setDate(expiresAt.getDate() + reviewPeriodDays);
  return new Date() > expiresAt;
}

/**
 * cancelSalesOrderStructured — 結構化取消（輪10）
 *
 * 同時處理：
 *  - cancel_requested_at / cancel_reason_code / cancel_within_review_period
 *  - 審閱期內：forfeit_rate 強制 0（後端再驗、不信前端傳值）
 *  - 審閱期後：forfeit_rate 0~10，必填 forfeit_reason，寫 audit_logs
 *  - 庫存恢復：中古車回 available；新車回 available + 清 linked_order_id
 */
export async function cancelSalesOrderStructured(
  id: string,
  input: CancelOrderInput,
): Promise<Result<{ id: string; within_review_period: boolean }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. 取出現況
  const { data: current } = await supabase
    .from("sales_orders")
    .select(
      "status, contract_type, used_vehicle_id, new_vehicle_id, signed_at, review_period_days, cancel_requested_at",
    )
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到訂單" };
  if (current.status === "cancelled") return { ok: false, error: "訂單已作廢" };
  if (current.status === "fulfilled") {
    return { ok: false, error: "已交車的訂單不可透過此入口取消，請使用「爭議」入口" };
  }

  // 2. 判斷審閱期
  const reviewPeriodDays =
    (current.review_period_days as number | null) ??
    REVIEW_PERIOD_DAYS[current.contract_type as "new" | "used"];
  const signedAt = current.signed_at as string | null;
  // 未簽約（draft/submitted）→ 直接免費取消，無審閱期概念
  const withinReviewPeriod: boolean = signedAt
    ? !isReviewPeriodExpired(signedAt, reviewPeriodDays)
    : true; // 未簽約 → 等同期內（全額退款）

  const reviewExpiresAt: string | null = signedAt
    ? (() => {
        const d = new Date(signedAt);
        d.setDate(d.getDate() + reviewPeriodDays);
        return d.toISOString();
      })()
    : null;

  // 3. 沒收比例驗證
  let forfeitRate = 0;
  let forfeitReason: string | null = null;
  if (withinReviewPeriod) {
    // 期內：強制 100% 退款 → forfeit_rate = 0（後端不接受任何非 0 值）
    if ((input.forfeit_rate ?? 0) !== 0) {
      return { ok: false, error: "審閱期內取消須 100% 退款，沒收比例必須為 0" };
    }
    forfeitRate = 0;
    forfeitReason = null;
  } else {
    // 期後：驗 0~10%
    const rate = input.forfeit_rate ?? 0;
    if (rate < 0 || rate > 10) {
      return { ok: false, error: "沒收比例不得超過 10%（主管裁量上限）" };
    }
    if (rate > 0 && !input.forfeit_reason?.trim()) {
      return { ok: false, error: "沒收比例 > 0% 時必須填寫沒收說明" };
    }
    forfeitRate = rate;
    forfeitReason = input.forfeit_reason?.trim() ?? null;
  }

  const nowIso = new Date().toISOString();

  // 4. 更新訂單狀態 + 取消欄位
  const { error: cancelErr } = await supabase
    .from("sales_orders")
    .update({
      status: "cancelled",
      cancel_requested_at: nowIso,
      cancel_reason_code: input.reason_code as CancelReasonCode,
      cancel_within_review_period: withinReviewPeriod,
      cancel_forfeit_rate: forfeitRate,
      cancel_forfeit_reason: forfeitReason,
      review_period_days: reviewPeriodDays,
      review_expires_at: reviewExpiresAt,
      updated_by: user?.id ?? null,
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (cancelErr) return { ok: false, error: `取消失敗：${cancelErr.message}` };

  // 5. 庫存恢復（中古車）
  const usedVehicleId = current.used_vehicle_id as string | null;
  if (usedVehicleId && (current.status === "signed" || current.status === "fulfilled")) {
    const { error: usedErr } = await supabase
      .from("used_car_inventory")
      .update({ status: "available", sold_date: null })
      .eq("id", usedVehicleId);
    if (usedErr) {
      console.error("[cancelSalesOrderStructured] 中古車庫存回滾失敗", usedErr.message);
    }
    revalidatePath("/usedcar/stock");
    revalidatePath("/sales/showroom/used-cars");
  }

  // 6. 庫存恢復（新車）— status → available，若 linked_order_id 欄位存在也一併清空
  const newVehicleId = current.new_vehicle_id as string | null;
  if (newVehicleId) {
    // 先嘗試含 linked_order_id 的完整清除；若欄位不存在退到只清 status
    const fullPatch = await supabase
      .from("new_car_inventory")
      .update({ status: "available", linked_sales_order_id: null })
      .eq("id", newVehicleId);
    if (fullPatch.error) {
      // linked_order_id 可能尚未落地 — fallback 只清 status
      const { error: fallbackErr } = await supabase
        .from("new_car_inventory")
        .update({ status: "available" })
        .eq("id", newVehicleId);
      if (fallbackErr) {
        console.error("[cancelSalesOrderStructured] 新車庫存回滾失敗", fallbackErr.message);
      }
    }
  }

  // 7. audit_log（非阻塞）
  after(async () => {
    await writeAuditLog({
      table_name: "sales_orders",
      record_id: id,
      action: "cancel_structured",
      actor_id: user?.id ?? null,
      brand_id: scope.brand_id,
      before: { status: current.status },
      after: {
        status: "cancelled",
        cancel_reason_code: input.reason_code,
        cancel_within_review_period: withinReviewPeriod,
        cancel_forfeit_rate: forfeitRate,
        cancel_forfeit_reason: forfeitReason,
      },
    });
  });

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${id}`);
  return { ok: true, data: { id, within_review_period: withinReviewPeriod } };
}

// ─────────────────────────────────────────────────────────────
// RS04③ 延期/無法交車
// ─────────────────────────────────────────────────────────────

/**
 * deferDelivery — RS04③ 廠方延遲或無法交車
 *
 * 兩種情況分流：
 *  - 'deferred'：更新 delivery_date + 在 metadata 記延期記錄
 *  - 'unable'：在 metadata 記「無法交車」記錄，等待主管協商
 *
 * 狀態機不變（仍為 signed），只在 metadata 增加記錄。
 */
export async function deferDelivery(
  id: string,
  input: DeferDeliveryInput,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("sales_orders")
    .select("status, delivery_date, metadata")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到訂單" };
  if (current.status !== "signed") {
    return { ok: false, error: "只有已簽約的訂單可申請延期/無法交車" };
  }

  const nowIso = new Date().toISOString();
  const existingMeta = (current.metadata as Record<string, unknown> | null) ?? {};
  const deferHistory: unknown[] = Array.isArray(existingMeta.defer_history)
    ? (existingMeta.defer_history as unknown[])
    : [];

  const newEvent = {
    at: nowIso,
    by: user?.id ?? null,
    resolution: input.resolution,
    new_delivery_date: input.new_delivery_date ?? null,
    reason: input.reason,
  };

  const patch: Record<string, unknown> = {
    metadata: {
      ...existingMeta,
      defer_history: [...deferHistory, newEvent],
      last_defer_resolution: input.resolution,
    },
    updated_by: user?.id ?? null,
  };

  // 展期 → 更新 delivery_date
  if (input.resolution === "deferred" && input.new_delivery_date) {
    patch.delivery_date = input.new_delivery_date;
  }
  // 無法交車 → dispute_frozen=true（等主管介入）
  if (input.resolution === "unable") {
    patch.dispute_frozen = true;
    patch.dispute_frozen_reason = `廠方無法交車：${input.reason}`;
  }

  const { error } = await supabase
    .from("sales_orders")
    .update(patch)
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `延期申請失敗：${error.message}` };

  after(async () => {
    await writeAuditLog({
      table_name: "sales_orders",
      record_id: id,
      action: `defer_delivery_${input.resolution}`,
      actor_id: user?.id ?? null,
      brand_id: scope.brand_id,
      before: { delivery_date: current.delivery_date },
      after: newEvent,
    });
  });

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${id}`);
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// RS04⑥ 中古車交車後爭議
// ─────────────────────────────────────────────────────────────

/**
 * raiseUsedCarPostDeliveryDispute — RS04⑥ 中古車交車後客戶爭議入口
 *
 * 只做「記錄 + 凍結訂單」，實體爭議由人工處理。
 * 新增一筆 dispute 記錄到 metadata.dispute_history，設 dispute_frozen=true。
 */
export async function raiseUsedCarPostDeliveryDispute(
  id: string,
  input: UsedCarPostDeliveryDisputeInput,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("sales_orders")
    .select("status, contract_type, metadata, dispute_frozen")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到訂單" };
  if (current.contract_type !== "used") {
    return { ok: false, error: "此入口僅適用於中古車訂單" };
  }
  if (current.status !== "fulfilled") {
    return { ok: false, error: "只有已交車的訂單可提交交車後爭議" };
  }

  const nowIso = new Date().toISOString();
  const existingMeta = (current.metadata as Record<string, unknown> | null) ?? {};
  const disputeHistory: unknown[] = Array.isArray(existingMeta.dispute_history)
    ? (existingMeta.dispute_history as unknown[])
    : [];

  const newDispute = {
    at: nowIso,
    raised_by: user?.id ?? null,
    reason: input.reason,
    detail: input.detail ?? null,
    status: "open",
  };

  const { error } = await supabase
    .from("sales_orders")
    .update({
      dispute_frozen: true,
      dispute_frozen_reason: input.reason,
      metadata: {
        ...existingMeta,
        dispute_history: [...disputeHistory, newDispute],
      },
      updated_by: user?.id ?? null,
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `爭議提交失敗：${error.message}` };

  after(async () => {
    await writeAuditLog({
      table_name: "sales_orders",
      record_id: id,
      action: "used_car_post_delivery_dispute_raised",
      actor_id: user?.id ?? null,
      brand_id: scope.brand_id,
      before: { dispute_frozen: current.dispute_frozen },
      after: newDispute,
    });
  });

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${id}`);
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// RS04⑦ 新車換車申請
// ─────────────────────────────────────────────────────────────

/**
 * requestNewCarReplacement — RS04⑦ 新車換車申請（非單純退款）
 *
 * 記錄換車申請，由主管審核後處理。
 * 「檸檬車」天數/公里門檻待律師確認前不做前端硬擋，
 * 只記錄參數佔位 + 寫 audit_log 供後續追蹤。
 *
 * 狀態機：fulfilled → 狀態不動（換車還沒完成），在 metadata 記 replace_request。
 */
// ─────────────────────────────────────────────────────────────
// RS04④ 三方簽名（輪5-7）
//
// 前端已把 dataURL 傳來；我們在 server action 層上傳 Storage、只寫 URL 回 DB。
// 上傳用既有 uploadSignatureDataUrl（bucket: ro-signatures, entity: sales-order）。
// 若三方全簽完（非 null）則自動設 contract_locked=true + 寫 audit_log。
// ─────────────────────────────────────────────────────────────

export type SaveSignaturesInput = {
  /** base64 dataURL 或已上傳的 Storage URL；null 代表「這方未簽」 */
  signature_buyer?: string | null;
  signature_seller?: string | null;
  signature_witness?: string | null;
};

export async function saveSignatures(
  id: string,
  input: SaveSignaturesInput,
): Promise<Result<{ id: string; contract_locked: boolean }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("sales_orders")
    .select("status, contract_locked, signature_buyer, signature_seller, signature_witness")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到訂單" };
  if (current.status === "cancelled") return { ok: false, error: "已作廢訂單不可簽名" };

  // 已鎖定：拒絕（需走 unlockContract 先解鎖）
  if (current.contract_locked) {
    return { ok: false, error: "合約已鎖定，如需修改請先由主管解鎖" };
  }

  // 動態 import 上傳 helper（server-only，不能在 client 端 tree-shake 到）
  const { uploadSignatureDataUrl } = await import("@/lib/aftersales/signature-upload");

  async function maybeUpload(
    dataUrl: string | null | undefined,
    role: string,
  ): Promise<string | null> {
    if (!dataUrl) return null;
    // 已是 Storage URL → pass through
    if (dataUrl.startsWith("https://") || dataUrl.startsWith("http://")) return dataUrl;
    const url = await uploadSignatureDataUrl(dataUrl, scope.brand_id, "sales-order", id, role);
    return url;
  }

  const [buyerUrl, sellerUrl, witnessUrl] = await Promise.all([
    maybeUpload(input.signature_buyer, "buyer"),
    maybeUpload(input.signature_seller, "seller"),
    maybeUpload(input.signature_witness, "witness"),
  ]);

  // Merge with existing: 傳 null 代表清除；undefined（未傳）保持原有
  const mergedBuyer =
    "signature_buyer" in input ? buyerUrl : ((current.signature_buyer as string | null) ?? null);
  const mergedSeller =
    "signature_seller" in input ? sellerUrl : ((current.signature_seller as string | null) ?? null);
  const mergedWitness =
    "signature_witness" in input
      ? witnessUrl
      : ((current.signature_witness as string | null) ?? null);

  // 三方全簽 → 自動鎖定
  const allSigned = !!(mergedBuyer && mergedSeller && mergedWitness);

  const { error } = await supabase
    .from("sales_orders")
    .update({
      signature_buyer: mergedBuyer,
      signature_seller: mergedSeller,
      signature_witness: mergedWitness,
      contract_locked: allSigned,
      updated_by: user?.id ?? null,
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `簽名儲存失敗：${error.message}` };

  if (allSigned) {
    // 寫合約快照到 metadata.contract_snapshot（凍結合約版本）
    const { data: full } = await supabase
      .from("sales_orders")
      .select(
        "order_no, contract_type, customer_name, vehicle_model_name, used_brand_model, total_amount, deal_price, special_notes, condition_notes, payment_method, delivery_date",
      )
      .eq("id", id)
      .maybeSingle();
    if (full) {
      // A2 版本控制：把簽署當下的法律文字版本一起凍結進快照
      // 後台改範本不影響已簽合約顯示（contract-viewer 讀快照優先）
      const { getActiveLegalText } = await import("@/domain/legal-texts");
      const { getBrandConfig } = await import("@/domain/brand-config");
      const docKey = full.contract_type === "used" ? "contract_terms_used" : "contract_terms_new";
      const [legalRow, brandCfg] = await Promise.all([
        getActiveLegalText(docKey),
        getBrandConfig(scope.brand_id),
      ]);
      const brandName = brandCfg.brandName ?? scope.brand_id;
      const dealerName = brandCfg.dealerName ?? brandName;
      const legalTextSnapshot = legalRow
        ? {
            doc_key: legalRow.doc_key,
            version: legalRow.version,
            content: legalRow.content
              .replace(/\{brand\}/g, brandName)
              .replace(/\{dealer\}/g, dealerName),
          }
        : null;

      const snapshot = {
        snapped_at: new Date().toISOString(),
        order_no: full.order_no,
        contract_type: full.contract_type,
        customer_name: full.customer_name,
        vehicle: full.vehicle_model_name ?? full.used_brand_model ?? null,
        total_amount: full.total_amount ?? full.deal_price ?? null,
        payment_method: full.payment_method ?? null,
        delivery_date: full.delivery_date ?? null,
        special_notes: full.special_notes ?? null,
        condition_notes: full.condition_notes ?? null,
        signature_buyer: mergedBuyer,
        signature_seller: mergedSeller,
        signature_witness: mergedWitness,
        // 法律文字版本快照（Russell 版本控制要求）
        legal_text: legalTextSnapshot,
      };
      // 更新 metadata 裡的快照（non-blocking; 錯了只 log）
      const { data: meta } = await supabase
        .from("sales_orders")
        .select("metadata")
        .eq("id", id)
        .maybeSingle();
      const existingMeta = (meta?.metadata as Record<string, unknown> | null) ?? {};
      await supabase
        .from("sales_orders")
        .update({ metadata: { ...existingMeta, contract_snapshot: snapshot } })
        .eq("id", id)
        .eq("brand_id", scope.brand_id);
    }

    // audit_log（非阻塞）
    after(async () => {
      await writeAuditLog({
        table_name: "sales_orders",
        record_id: id,
        action: "contract_signed_and_locked",
        actor_id: user?.id ?? null,
        brand_id: scope.brand_id,
        before: { contract_locked: false },
        after: { contract_locked: true, all_signatures_captured: true },
      });
    });
  }

  revalidatePath(`/sales/orders/${id}`);
  revalidatePath(`/sales/orders/${id}/contract`);
  return { ok: true, data: { id, contract_locked: allSigned } };
}

// ─────────────────────────────────────────────────────────────
// RS04⑤ 鎖定解鎖（輪5-8）
//
// lockContract: 手動鎖定（三方簽完後也可手動觸發，幂等）
// unlockContract: 需主管權限，寫 audit_log
// ─────────────────────────────────────────────────────────────

export async function lockContract(id: string): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("sales_orders")
    .select("status, contract_locked")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到訂單" };
  if (current.status === "cancelled") return { ok: false, error: "已作廢訂單不可鎖定" };

  const { error } = await supabase
    .from("sales_orders")
    .update({ contract_locked: true, updated_by: user?.id ?? null })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `鎖定失敗：${error.message}` };

  after(async () => {
    await writeAuditLog({
      table_name: "sales_orders",
      record_id: id,
      action: "contract_locked",
      actor_id: user?.id ?? null,
      brand_id: scope.brand_id,
      before: { contract_locked: current.contract_locked },
      after: { contract_locked: true },
    });
  });

  revalidatePath(`/sales/orders/${id}`);
  revalidatePath(`/sales/orders/${id}/contract`);
  return { ok: true, data: { id } };
}

export async function unlockContract(
  id: string,
  reason: string,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!reason.trim()) return { ok: false, error: "請填寫解鎖原因" };

  const { data: current } = await supabase
    .from("sales_orders")
    .select("status, contract_locked, metadata")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到訂單" };
  if (!current.contract_locked) return { ok: false, error: "合約尚未鎖定" };
  if (current.status === "cancelled") return { ok: false, error: "已作廢訂單不可操作" };

  // 在 metadata 記錄解鎖歷史
  const existingMeta = (current.metadata as Record<string, unknown> | null) ?? {};
  const unlockHistory = Array.isArray(existingMeta.unlock_history)
    ? (existingMeta.unlock_history as unknown[])
    : [];
  const newUnlock = {
    at: new Date().toISOString(),
    by: user?.id ?? null,
    reason: reason.trim(),
  };

  const { error } = await supabase
    .from("sales_orders")
    .update({
      contract_locked: false,
      metadata: { ...existingMeta, unlock_history: [...unlockHistory, newUnlock] },
      updated_by: user?.id ?? null,
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `解鎖失敗：${error.message}` };

  after(async () => {
    await writeAuditLog({
      table_name: "sales_orders",
      record_id: id,
      action: "contract_unlocked",
      actor_id: user?.id ?? null,
      brand_id: scope.brand_id,
      before: { contract_locked: true },
      after: { contract_locked: false, reason: reason.trim() },
    });
  });

  revalidatePath(`/sales/orders/${id}`);
  revalidatePath(`/sales/orders/${id}/contract`);
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// A-6 融資狀態更新（financing_status / financing_applied_at）
//
// 規則：
//  - 任何 canEdit 的人可把 financing_status 設為 not_applicable / pending_approval / approved / rejected
//  - pending_approval → 同時寫 financing_applied_at（若未填）
//  - 逾時 7 天（POC 暫定）：由 after() 非阻塞推追蹤通知（待裁示後補實作）
// ─────────────────────────────────────────────────────────────

export async function updateFinancingStatus(
  id: string,
  input: UpdateFinancingInput,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("sales_orders")
    .select("status, financing_status, financing_applied_at, payment_method")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到訂單" };
  if (current.status === "cancelled") return { ok: false, error: "已作廢訂單不可修改" };

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    financing_status: input.financing_status,
    updated_by: user?.id ?? null,
  };

  // 進入 pending_approval → 記申請時間（冪等：已有就保留）
  if (input.financing_status === "pending_approval" && !current.financing_applied_at) {
    patch.financing_applied_at = nowIso;
  }

  const { error } = await supabase
    .from("sales_orders")
    .update(patch)
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `融資狀態更新失敗：${error.message}` };

  // 非阻塞：pending_approval 逾期追蹤（7 天暫頂，待裁示）
  if (input.financing_status === "pending_approval") {
    after(async () => {
      await writeAuditLog({
        table_name: "sales_orders",
        record_id: id,
        action: "financing_pending_approval_started",
        actor_id: user?.id ?? null,
        brand_id: scope.brand_id,
        before: { financing_status: current.financing_status },
        after: { financing_status: "pending_approval", financing_applied_at: patch.financing_applied_at ?? current.financing_applied_at },
      });
    });
  }

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${id}`);
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// A-9 業務員轉移（reassign）
//
// 主管操作：把訂單的 rs_name 轉給另一位業務員。
// 同時：
//  1. 寫 sales_orders.reassigned_from / reassigned_to / reassigned_at
//  2. 若訂單有對應 call_tasks（created_by / metadata.order_id = orderId）
//     → update call_tasks.assigned_to = 新業務員的 employee_id（查詢員工表）
//  3. 寫 audit_logs
// ─────────────────────────────────────────────────────────────

export async function reassignSalesOrder(
  id: string,
  input: ReassignOrderInput,
): Promise<Result<{ id: string }>> {
  if (!input.new_rs_name.trim()) {
    return { ok: false, error: "接手業務員姓名必填" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("sales_orders")
    .select("status, rs_name, created_by")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到訂單" };
  if (current.status === "cancelled") return { ok: false, error: "已作廢訂單不可轉移" };

  const oldRsName = (current.rs_name as string | null) ?? null;
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("sales_orders")
    .update({
      rs_name: input.new_rs_name.trim(),
      reassigned_from: oldRsName,
      reassigned_to: input.new_rs_name.trim(),
      reassigned_at: nowIso,
      updated_by: user?.id ?? null,
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `業務轉移失敗：${error.message}` };

  // 連動 call_tasks 轉移：找對應此訂單的 call_tasks，更新 metadata.rs_name
  after(async () => {
    try {
      // call_tasks 的 metadata 裡通常帶 order_id；查詢 metadata->>'order_id' = id
      const { data: tasks } = await supabase
        .from("call_tasks")
        .select("id, metadata")
        .eq("brand_id", scope.brand_id)
        .filter("metadata->>'order_id'", "eq", id);

      for (const task of tasks ?? []) {
        const meta = (task.metadata as Record<string, unknown>) ?? {};
        await supabase
          .from("call_tasks")
          .update({ metadata: { ...meta, rs_name: input.new_rs_name.trim(), reassigned_by_manager_at: nowIso } })
          .eq("id", task.id);
      }
    } catch (e) {
      console.error("[reassignSalesOrder] call_tasks 轉移失敗（非阻塞）", e);
    }

    // audit_log
    await writeAuditLog({
      table_name: "sales_orders",
      record_id: id,
      action: "order_reassigned",
      actor_id: user?.id ?? null,
      brand_id: scope.brand_id,
      before: { rs_name: oldRsName },
      after: { rs_name: input.new_rs_name.trim(), reason: input.reason ?? null },
    });
  });

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${id}`);
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// B-3 linkTradeInToSalesOrder — 以舊換新串聯
//
// 回填 sales_orders.trade_in_linked_order_id（指向中古車收購訂單）
// 同時確保 negative_equity_resolution 已填（差價 < 0 時必填）。
// ─────────────────────────────────────────────────────────────

export async function linkTradeInToSalesOrder(
  id: string,
  {
    tradeInOrderId,
    negativeEquityResolution,
  }: {
    tradeInOrderId: string;
    negativeEquityResolution?: "rolled_into_price" | "cash_topup" | null;
  },
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("sales_orders")
    .select("status, deal_price, total_amount")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到訂單" };
  if (current.status === "cancelled") return { ok: false, error: "已作廢訂單不可操作" };

  // 取收購單的收購金額（deal_price 或 total_amount）
  const { data: tradeIn } = await supabase
    .from("sales_orders")
    .select("deal_price, total_amount, contract_type")
    .eq("id", tradeInOrderId)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!tradeIn) return { ok: false, error: "找不到舊車收購訂單" };
  if ((tradeIn.contract_type as string) !== "used") {
    return { ok: false, error: "收購訂單必須是中古車合約" };
  }

  const tradeInPrice = Math.abs(Number(tradeIn.deal_price ?? tradeIn.total_amount ?? 0));
  const newVehiclePrice = Number(current.deal_price ?? current.total_amount ?? 0);
  const balance = newVehiclePrice - tradeInPrice;

  // 差價為負但未選解法 → 攔截
  if (balance < 0 && !negativeEquityResolution) {
    return {
      ok: false,
      error: `差價為負（收購 ${tradeInPrice} > 車款 ${newVehiclePrice}），請選擇差價處理方式後再連結`,
    };
  }

  const patch: Record<string, unknown> = {
    trade_in_linked_order_id: tradeInOrderId,
    updated_by: user?.id ?? null,
  };
  if (negativeEquityResolution) {
    patch.negative_equity_resolution = negativeEquityResolution;
  }

  const { error } = await supabase
    .from("sales_orders")
    .update(patch)
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `連結收購單失敗：${error.message}` };

  after(async () => {
    await writeAuditLog({
      table_name: "sales_orders",
      record_id: id,
      action: "trade_in_linked",
      actor_id: user?.id ?? null,
      brand_id: scope.brand_id,
      before: { trade_in_linked_order_id: null },
      after: { trade_in_linked_order_id: tradeInOrderId, negative_equity_resolution: negativeEquityResolution ?? null },
    });
  });

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${id}`);
  return { ok: true, data: { id } };
}

export async function requestNewCarReplacement(
  id: string,
  input: ReplaceNewCarInput,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("sales_orders")
    .select("status, contract_type, metadata")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到訂單" };
  if (current.contract_type !== "new") {
    return { ok: false, error: "此入口僅適用於新車訂單" };
  }
  if (current.status !== "fulfilled") {
    return { ok: false, error: "只有已交車的訂單可申請換車" };
  }

  const nowIso = new Date().toISOString();
  const existingMeta = (current.metadata as Record<string, unknown> | null) ?? {};

  const replaceRequest = {
    at: nowIso,
    raised_by: user?.id ?? null,
    reason: input.reason,
    replacement_vehicle_id: input.replacement_vehicle_id ?? null,
    detail: input.detail ?? null,
    status: "pending",
    // 檸檬車門檻佔位（待律師確認後從 business_rules 讀）
    thresholds_applied: null,
  };

  const { error } = await supabase
    .from("sales_orders")
    .update({
      metadata: {
        ...existingMeta,
        replace_request: replaceRequest,
      },
      updated_by: user?.id ?? null,
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `換車申請失敗：${error.message}` };

  after(async () => {
    await writeAuditLog({
      table_name: "sales_orders",
      record_id: id,
      action: "new_car_replace_requested",
      actor_id: user?.id ?? null,
      brand_id: scope.brand_id,
      before: null,
      after: replaceRequest,
    });
  });

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${id}`);
  return { ok: true, data: { id } };
}

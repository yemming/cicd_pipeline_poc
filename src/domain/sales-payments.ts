import "server-only";

/**
 * Domain Helper — Sales Payments（銷售金流帳冊）
 *
 * B1 schema: sales_payments 表
 * 涵蓋：新車銷售 / 中古車銷售 / 以舊換新三筆分拆 /
 *        批售給外部買家 / 純收購中古車
 *
 * UI 嚴禁直接 import @/lib/supabase；所有讀寫透過此 helper。
 *
 * A-8 規則：payment_method 為轉帳類 → settlement_status='pending_settlement'
 *            現金 / 刷卡 → settlement_status='settled'
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { writeAuditLog } from "./audit-logs";
import type {
  Result,
  SalesPaymentRow,
  CreateSalesPaymentInput,
  ListSalesPaymentsFilter,
  TradeInSplitInput,
  WholesaleToExternalInput,
  PurePurchaseInput,
  SettlementStatus,
} from "./sales-payments.constants";

// ─────────────────────────────────────────────────────────────
// Re-export types（讓 server-side caller import from "@/domain/sales-payments"）
// ─────────────────────────────────────────────────────────────
export type {
  Result,
  SalesPaymentRow,
  CreateSalesPaymentInput,
  ListSalesPaymentsFilter,
  TradeInSplitInput,
  WholesaleToExternalInput,
  PurePurchaseInput,
  SettlementStatus,
} from "./sales-payments.constants";

export {
  PAYMENT_SOURCE_TYPES,
  PAYMENT_SOURCE_TYPE_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_CHIP,
  SETTLEMENT_STATUSES,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_CHIP,
} from "./sales-payments.constants";

export const PAYMENTS_PAGE_SIZE_DEFAULT = 50;

// ─────────────────────────────────────────────────────────────
// 內部工具：A-8 規則 — 依付款方式決定 settlement_status
// 轉帳（bank_transfer / transfer）→ pending_settlement
// 其餘（cash / card / 其他）→ settled
// ─────────────────────────────────────────────────────────────

function resolveSettlementStatus(paymentMethod: string): SettlementStatus {
  const method = paymentMethod.toLowerCase();
  if (method === "bank_transfer" || method === "transfer" || method === "wire") {
    return "pending_settlement";
  }
  return "settled";
}

// ─────────────────────────────────────────────────────────────
// List
// ─────────────────────────────────────────────────────────────

export async function listSalesPayments(
  filter: ListSalesPaymentsFilter = {},
): Promise<{ rows: SalesPaymentRow[]; totalCount: number }> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.max(1, filter.pageSize ?? PAYMENTS_PAGE_SIZE_DEFAULT);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("sales_payments")
    .select("*", { count: "exact" })
    .eq("brand_id", scope.brand_id)
    .order("paid_at", { ascending: false })
    .range(from, to);

  if (filter.order_id) q = q.eq("order_id", filter.order_id);
  if (filter.source_type) q = q.eq("source_type", filter.source_type);
  if (filter.payment_status) q = q.eq("payment_status", filter.payment_status);
  if (filter.settlement_status) q = q.eq("settlement_status", filter.settlement_status);

  const { data, error, count } = await q;
  if (error) throw error;

  const rows: SalesPaymentRow[] = (data ?? []).map((r) => ({
    ...r,
    total_amount: Number(r.total_amount),
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  }));

  return { rows, totalCount: count ?? 0 };
}

// ─────────────────────────────────────────────────────────────
// Get by order_id（給訂單詳情頁側邊收款明細用）
// ─────────────────────────────────────────────────────────────

export async function getPaymentsByOrderId(
  orderId: string,
): Promise<SalesPaymentRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("sales_payments")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .eq("order_id", orderId)
    .order("paid_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((r) => ({
    ...r,
    total_amount: Number(r.total_amount),
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  }));
}

// ─────────────────────────────────────────────────────────────
// Create — 單筆建立
//
// brand_id 從 getActiveScope() 取，不從 input 拿（天條）。
// settlement_status 若 input 未指定，依 A-8 規則自動決定。
// ─────────────────────────────────────────────────────────────

export async function createSalesPayment(
  input: CreateSalesPaymentInput,
): Promise<Result<{ id: string }>> {
  if (!input.order_no?.trim()) {
    return { ok: false, error: "訂單號必填" };
  }
  if (!input.source_type) {
    return { ok: false, error: "來源類型必填" };
  }
  if (input.total_amount === undefined || input.total_amount === null) {
    return { ok: false, error: "金額必填" };
  }
  if (!input.payment_method?.trim()) {
    return { ok: false, error: "付款方式必填" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A-8：自動決定 settlement_status
  const settlementStatus: SettlementStatus =
    input.settlement_status ?? resolveSettlementStatus(input.payment_method);

  const { data, error } = await supabase
    .from("sales_payments")
    .insert({
      brand_id: scope.brand_id,
      order_id: input.order_id ?? null,
      order_no: input.order_no.trim(),
      source_type: input.source_type,
      total_amount: input.total_amount,
      payment_method: input.payment_method,
      payment_status: input.payment_status ?? "paid",
      settlement_status: settlementStatus,
      paid_at: input.paid_at ?? new Date().toISOString(),
      store_id: input.store_id ?? null,
      created_by: user?.id ?? null,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: `建立收款記錄失敗：${error.message}` };
  }

  revalidatePath("/sales/orders");
  return { ok: true, data: { id: data.id } };
}

// ─────────────────────────────────────────────────────────────
// recordTradeInSplit — 以舊換新三筆分拆
//
// 同時 insert 三筆（同一個 DB round-trip 批次）：
//   1. new_vehicle_sale    → newVehiclePrice（正）
//   2. trade_in_acquisition → -tradeInPrice（負，代表公司付給客戶）
//   3. trade_in_balance    → newVehiclePrice - tradeInPrice（正，差額）
//
// 全部 payment_status='paid'；
// new_vehicle_sale 的 settlement_status 依 paymentMethod + A-8 決定；
// trade_in_acquisition 固定 pending_settlement（轉帳給客戶）；
// trade_in_balance 依差額付款方式（同 paymentMethod）決定。
// ─────────────────────────────────────────────────────────────

export async function recordTradeInSplit(
  input: TradeInSplitInput,
): Promise<Result<{ ids: string[] }>> {
  if (!input.orderId?.trim()) {
    return { ok: false, error: "訂單 ID 必填" };
  }
  if (!input.orderNo?.trim()) {
    return { ok: false, error: "訂單號必填" };
  }
  if (!(input.newVehiclePrice > 0)) {
    return { ok: false, error: "新車售價必須大於 0" };
  }
  if (!(input.tradeInPrice > 0)) {
    return { ok: false, error: "舊車收購價必須大於 0" };
  }
  if (!input.paymentMethod?.trim()) {
    return { ok: false, error: "付款方式必填" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date().toISOString();
  const brand = scope.brand_id;
  const userId = user?.id ?? null;
  const baseMeta = input.metadata ?? {};

  const newVehicleSettlement = resolveSettlementStatus(input.paymentMethod);
  const balanceAmount = input.newVehiclePrice - input.tradeInPrice;

  const rows = [
    // 1. 新車銷售收款
    {
      brand_id: brand,
      order_id: input.orderId,
      order_no: input.orderNo,
      source_type: "new_vehicle_sale" as const,
      total_amount: input.newVehiclePrice,
      payment_method: input.paymentMethod,
      payment_status: "paid" as const,
      settlement_status: newVehicleSettlement,
      paid_at: now,
      store_id: null,
      created_by: userId,
      metadata: { ...baseMeta, trade_in_split: true, split_role: "new_vehicle" },
    },
    // 2. 舊車收購（公司付款給客戶 → 負值）
    {
      brand_id: brand,
      order_id: input.orderId,
      order_no: input.orderNo,
      source_type: "trade_in_acquisition" as const,
      total_amount: -Math.abs(input.tradeInPrice),
      payment_method: "bank_transfer", // 收購固定轉帳
      payment_status: "recorded_payable" as const, // 尚未付款給客戶
      settlement_status: "pending_settlement" as const,
      paid_at: now,
      store_id: null,
      created_by: userId,
      metadata: { ...baseMeta, trade_in_split: true, split_role: "trade_in_acquisition" },
    },
    // 3. 差額（客戶實際需補差價）
    {
      brand_id: brand,
      order_id: input.orderId,
      order_no: input.orderNo,
      source_type: "trade_in_balance" as const,
      total_amount: balanceAmount,
      payment_method: input.paymentMethod,
      payment_status: "paid" as const,
      settlement_status: resolveSettlementStatus(input.paymentMethod),
      paid_at: now,
      store_id: null,
      created_by: userId,
      metadata: { ...baseMeta, trade_in_split: true, split_role: "balance" },
    },
  ];

  const { data, error } = await supabase
    .from("sales_payments")
    .insert(rows)
    .select("id");

  if (error) {
    return { ok: false, error: `以舊換新分拆建立失敗：${error.message}` };
  }

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${input.orderId}`);

  return {
    ok: true,
    data: { ids: (data ?? []).map((r) => r.id) },
  };
}

// ─────────────────────────────────────────────────────────────
// recordWholesaleToExternal — 批售給外部買家
//
// source_type='wholesale_to_external'，正值（公司賣出，收款）
// ─────────────────────────────────────────────────────────────

export async function recordWholesaleToExternal(
  input: WholesaleToExternalInput,
): Promise<Result<{ id: string }>> {
  if (!input.order_no?.trim()) {
    return { ok: false, error: "訂單號必填" };
  }
  if (!(input.total_amount > 0)) {
    return { ok: false, error: "批售金額必須大於 0" };
  }
  if (!input.payment_method?.trim()) {
    return { ok: false, error: "付款方式必填" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const settlementStatus = resolveSettlementStatus(input.payment_method);

  const { data, error } = await supabase
    .from("sales_payments")
    .insert({
      brand_id: scope.brand_id,
      order_id: input.order_id ?? null,
      order_no: input.order_no.trim(),
      source_type: "wholesale_to_external",
      total_amount: Math.abs(input.total_amount), // 確保正值
      payment_method: input.payment_method,
      payment_status: "paid",
      settlement_status: settlementStatus,
      paid_at: input.paid_at ?? new Date().toISOString(),
      store_id: null,
      created_by: user?.id ?? null,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: `批售記錄建立失敗：${error.message}` };
  }

  revalidatePath("/sales/orders");
  return { ok: true, data: { id: data.id } };
}

// ─────────────────────────────────────────────────────────────
// recordPurePurchase — 純收購中古車
//
// source_type='pure_purchase'，負值（公司付款給車主，現金流出）
// payment_status='recorded_payable'（應付款，待實際轉帳）
// settlement_status='pending_settlement'（固定待結算）
// ─────────────────────────────────────────────────────────────

export async function recordPurePurchase(
  input: PurePurchaseInput,
): Promise<Result<{ id: string }>> {
  if (!input.order_no?.trim()) {
    return { ok: false, error: "訂單號必填" };
  }
  if (!(input.purchase_amount > 0)) {
    return { ok: false, error: "收購金額必須大於 0" };
  }
  if (!input.payment_method?.trim()) {
    return { ok: false, error: "付款方式必填" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("sales_payments")
    .insert({
      brand_id: scope.brand_id,
      order_id: input.order_id ?? null,
      order_no: input.order_no.trim(),
      source_type: "pure_purchase",
      total_amount: -Math.abs(input.purchase_amount), // 固定負值（公司付款）
      payment_method: input.payment_method,
      payment_status: "recorded_payable", // 純收購先記應付，待實際轉帳
      settlement_status: "pending_settlement",
      paid_at: input.paid_at ?? new Date().toISOString(),
      store_id: null,
      created_by: user?.id ?? null,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: `純收購記錄建立失敗：${error.message}` };
  }

  revalidatePath("/sales/orders");
  return { ok: true, data: { id: data.id } };
}

// ─────────────────────────────────────────────────────────────
// A-8：財務確認到帳 — pending_settlement → settled
// ─────────────────────────────────────────────────────────────

export async function confirmSettlement(
  id: string,
  note?: string,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("sales_payments")
    .select("id, settlement_status, order_no, metadata")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到收款記錄" };
  if (current.settlement_status === "settled") {
    return { ok: false, error: "此筆已是已到帳狀態" };
  }

  const nowIso = new Date().toISOString();
  const prevMetadata = (current.metadata ?? {}) as Record<string, unknown>;
  const { error: updateErr } = await supabase
    .from("sales_payments")
    .update({
      settlement_status: "settled",
      metadata: {
        ...prevMetadata,
        settlement_confirmed_at: nowIso,
        settlement_confirmed_by: user?.id ?? null,
        settlement_confirm_note: note?.trim() || null,
      },
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (updateErr) return { ok: false, error: `確認到帳失敗：${updateErr.message}` };

  await writeAuditLog({
    table_name: "sales_payments",
    record_id: id,
    action: "confirm_settlement",
    actor_id: user?.id ?? null,
    brand_id: scope.brand_id,
    before: { settlement_status: current.settlement_status },
    after: { settlement_status: "settled", note: note?.trim() || null },
  });

  revalidatePath("/sales/orders");
  return { ok: true, data: { id } };
}

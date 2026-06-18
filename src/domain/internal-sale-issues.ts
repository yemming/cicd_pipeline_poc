"use server";

/**
 * Domain Helper — Internal Sale Issues（內售出庫，stock_issues.type='internal_sale'）
 *
 * 規格來源：Notion BDN §Phase 2 · Batch M04U · M04U-20
 *  - List 頂 KpiCard（今日出庫筆數 / 查收中 / 已送達 / 結算金額）
 *  - Detail 加門店選擇 placeholder map + 配送 ETA
 *  - DB：getInternalSaleIssues + estimateDeliveryEta + setDeliveryStatus
 *  - 互動：取消出庫 modal 確認（沿用 voidIssue）
 *
 * 對映表：stock_issues（typed columns + metadata jsonb）
 *  - 新 typed columns：destination_store_id, delivery_eta_at, delivery_address,
 *    recipient_name, recipient_phone, delivery_status
 *
 * 紀律：UI 只 import 本 helper、禁止直接 @/lib/supabase；
 *      建單與作廢仍走既有 @/domain/issues（FIFO + accounting hook），
 *      本 helper 只負責「list / detail / delivery 維護」這三件事。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  resolvePaymentStatus,
  type PaymentStatus,
} from "@/domain/internal-sale-issues.constants";

export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// Row types
// ─────────────────────────────────────────────────────────────
export type InternalSaleIssueRow = {
  id: string;
  gi_no: string;
  brand_id: string;
  type: string;
  status: string;
  warehouse_id: string;
  warehouse_code: string | null;
  warehouse_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  destination_store_id: string | null;
  destination_store_code: string | null;
  destination_store_name: string | null;
  issue_date: string;
  qty_issued_total: number;
  amount_total: number;
  notes: string | null;
  delivery_status: string | null;
  delivery_eta_at: string | null;
  delivery_address: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  posted_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  /** 應收帳款狀態（computed from metadata，null = 不適用/作廢/零元） */
  payment_status: PaymentStatus | null;
  /** metadata.expected_payment_date（YYYY-MM-DD），供 UI tooltip 顯示 */
  expected_payment_date: string | null;
};

export type InternalSaleIssueLine = {
  id: string;
  line_no: number;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  bin_id: string | null;
  bin_label: string | null;
  qty_issued: number;
  uom: string;
  unit_cost: number | null;
  unit_price: number | null;
  line_amount: number | null;
  serial_no: string | null;
  batch_no: string | null;
  notes: string | null;
};

export type InternalSaleIssueDetail = InternalSaleIssueRow & {
  warehouse_code_full: string | null;
  posted_by_name: string | null;
  voided_by_name: string | null;
  gl_posted: boolean;
  lines: InternalSaleIssueLine[];
};

export type StoreOption = {
  id: string;
  code: string | null;
  name: string;
};

export type WarehouseOption = {
  id: string;
  code: string | null;
  name: string;
};

export type InternalSaleIssueKpis = {
  totalCount: number;
  todayCount: number;
  inTransitCount: number;
  deliveredCount: number;
  totalAmount: number;
  /** 已出貨未收款筆數（status != cancelled, amount > 0, payment_received != true） */
  unpaidCount: number;
  /** 已出貨未收款金額合計 */
  unpaidAmount: number;
  /** 逾期未收款筆數（expected_payment_date < today） */
  overdueUnpaidCount: number;
};

export type InternalSaleIssueFilter = {
  status?: string;
  delivery_status?: string;
  payment_status?: string;
  warehouse_id?: string;
  destination_store_id?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
};

// ─────────────────────────────────────────────────────────────
// List + KPI（合在同一支 server action 省一次 round-trip）
// ─────────────────────────────────────────────────────────────
export type InternalSaleIssuesPageData = {
  rows: InternalSaleIssueRow[];
  total: number;
  kpis: InternalSaleIssueKpis;
  warehouses: WarehouseOption[];
  destinationStores: StoreOption[];
  canEdit: boolean;
  loadError: string | null;
};

export async function getInternalSaleIssuesPageData(
  filter: InternalSaleIssueFilter = {},
): Promise<InternalSaleIssuesPageData> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const brandId = scope.brand_id;

  const baseCols =
    "id, gi_no, brand_id, type, status, warehouse_id, customer_id, destination_store_id, issue_date, qty_issued_total, amount_total, notes, delivery_status, delivery_eta_at, delivery_address, recipient_name, recipient_phone, posted_at, voided_at, void_reason, metadata";

  let q = supabase
    .from("stock_issues")
    .select(baseCols)
    .eq("brand_id", brandId)
    .eq("type", "internal_sale")
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);

  if (filter.status && filter.status !== "all") q = q.eq("status", filter.status);
  if (filter.delivery_status && filter.delivery_status !== "all") {
    q = q.eq("delivery_status", filter.delivery_status);
  }
  // payment_status filter 在 client-side 做（metadata jsonb 不適合 server-side 篩選）
  if (filter.warehouse_id) q = q.eq("warehouse_id", filter.warehouse_id);
  if (filter.destination_store_id) {
    q = q.eq("destination_store_id", filter.destination_store_id);
  }
  if (filter.date_from) q = q.gte("issue_date", filter.date_from);
  if (filter.date_to) q = q.lte("issue_date", filter.date_to);
  if (filter.q) q = q.ilike("gi_no", `%${filter.q}%`);

  const [rowsRes, whRes, storeRes, canEdit] = await Promise.all([
    q,
    supabase
      .from("warehouses")
      .select("id, code, name")
      .eq("brand_id", brandId)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("organizations")
      .select("id, code, name")
      .eq("brand_id", brandId)
      .eq("level", 2)
      .order("code"),
    hasPermission(PERMISSIONS.ISSUE_CREATE),
  ]);

  if (rowsRes.error) {
    return {
      rows: [],
      total: 0,
      kpis: {
        totalCount: 0,
        todayCount: 0,
        inTransitCount: 0,
        deliveredCount: 0,
        totalAmount: 0,
        unpaidCount: 0,
        unpaidAmount: 0,
        overdueUnpaidCount: 0,
      },
      warehouses: (whRes.data ?? []) as WarehouseOption[],
      destinationStores: (storeRes.data ?? []) as StoreOption[],
      canEdit,
      loadError: rowsRes.error.message,
    };
  }

  const rawRows = rowsRes.data ?? [];
  const wIds = Array.from(
    new Set(rawRows.map((r) => r.warehouse_id).filter((x): x is string => !!x)),
  );
  const cIds = Array.from(
    new Set(rawRows.map((r) => r.customer_id).filter((x): x is string => !!x)),
  );
  const dsIds = Array.from(
    new Set(rawRows.map((r) => r.destination_store_id).filter((x): x is string => !!x)),
  );

  const [whJoin, custJoin, dsJoin] = await Promise.all([
    wIds.length
      ? supabase.from("warehouses").select("id, code, name").in("id", wIds)
      : Promise.resolve({ data: [], error: null } as const),
    cIds.length
      ? supabase.from("customers").select("id, name").in("id", cIds)
      : Promise.resolve({ data: [], error: null } as const),
    dsIds.length
      ? supabase.from("organizations").select("id, code, name").in("id", dsIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  const whMap = new Map(
    (whJoin.data ?? []).map((w) => [w.id, { code: w.code, name: w.name }] as const),
  );
  const cMap = new Map((custJoin.data ?? []).map((c) => [c.id, c.name] as const));
  const dsMap = new Map(
    (dsJoin.data ?? []).map((s) => [s.id, { code: s.code, name: s.name }] as const),
  );

  const today = new Date().toISOString().slice(0, 10);

  const rows: InternalSaleIssueRow[] = rawRows.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const amountTotal = Number(r.amount_total ?? 0);
    const paymentStatus = resolvePaymentStatus(
      r.status,
      amountTotal,
      r.issue_date,
      meta,
      today,
    );
    const expectedPaymentDate =
      typeof meta.expected_payment_date === "string" && meta.expected_payment_date.length === 10
        ? meta.expected_payment_date
        : null;

    return {
      id: r.id,
      gi_no: r.gi_no,
      brand_id: r.brand_id,
      type: r.type,
      status: r.status,
      warehouse_id: r.warehouse_id,
      warehouse_code: r.warehouse_id ? whMap.get(r.warehouse_id)?.code ?? null : null,
      warehouse_name: r.warehouse_id ? whMap.get(r.warehouse_id)?.name ?? null : null,
      customer_id: r.customer_id,
      customer_name: r.customer_id ? cMap.get(r.customer_id) ?? null : null,
      destination_store_id: r.destination_store_id,
      destination_store_code: r.destination_store_id
        ? dsMap.get(r.destination_store_id)?.code ?? null
        : null,
      destination_store_name: r.destination_store_id
        ? dsMap.get(r.destination_store_id)?.name ?? null
        : null,
      issue_date: r.issue_date,
      qty_issued_total: Number(r.qty_issued_total ?? 0),
      amount_total: amountTotal,
      notes: r.notes,
      delivery_status: r.delivery_status,
      delivery_eta_at: r.delivery_eta_at,
      delivery_address: r.delivery_address,
      recipient_name: r.recipient_name,
      recipient_phone: r.recipient_phone,
      posted_at: r.posted_at,
      voided_at: r.voided_at,
      void_reason: r.void_reason,
      payment_status: paymentStatus,
      expected_payment_date: expectedPaymentDate,
    };
  });

  // payment_status filter（client-side，metadata 不適合 DB-level filter）
  const paymentStatusFilter = filter.payment_status && filter.payment_status !== "all"
    ? filter.payment_status
    : null;
  const filteredRows = paymentStatusFilter
    ? rows.filter((r) => r.payment_status === paymentStatusFilter)
    : rows;

  const unpaidRows = rows.filter(
    (r) => r.payment_status === "unpaid" || r.payment_status === "overdue",
  );
  const kpis: InternalSaleIssueKpis = {
    totalCount: rows.length,
    todayCount: rows.filter((r) => r.issue_date === today).length,
    inTransitCount: rows.filter(
      (r) => r.status === "completed" && r.delivery_status === "in_transit",
    ).length,
    deliveredCount: rows.filter(
      (r) => r.status === "completed" && r.delivery_status === "delivered",
    ).length,
    totalAmount: rows
      .filter((r) => r.status === "completed")
      .reduce((s, r) => s + r.amount_total, 0),
    unpaidCount: unpaidRows.length,
    unpaidAmount: unpaidRows.reduce((s, r) => s + r.amount_total, 0),
    overdueUnpaidCount: rows.filter((r) => r.payment_status === "overdue").length,
  };

  return {
    rows: filteredRows,
    total: filteredRows.length,
    kpis,
    warehouses: (whRes.data ?? []) as WarehouseOption[],
    destinationStores: (storeRes.data ?? []) as StoreOption[],
    canEdit,
    loadError: null,
  };
}

// ─────────────────────────────────────────────────────────────
// Detail
// ─────────────────────────────────────────────────────────────
export async function getInternalSaleIssueById(
  id: string,
): Promise<InternalSaleIssueDetail | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: row, error } = await supabase
    .from("stock_issues")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("type", "internal_sale")
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const [wRes, cRes, dsRes, postedByRes, voidedByRes] = await Promise.all([
    row.warehouse_id
      ? supabase
          .from("warehouses")
          .select("name, code")
          .eq("id", row.warehouse_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    row.customer_id
      ? supabase.from("customers").select("name").eq("id", row.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    row.destination_store_id
      ? supabase
          .from("organizations")
          .select("code, name")
          .eq("id", row.destination_store_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    row.posted_by
      ? supabase
          .from("profiles")
          .select("display_name")
          .eq("id", row.posted_by)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    row.voided_by
      ? supabase
          .from("profiles")
          .select("display_name")
          .eq("id", row.voided_by)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
  ]);

  const { data: rawLines, error: lineErr } = await supabase
    .from("stock_issue_lines")
    .select(
      "id, line_no, item_id, bin_id, qty_issued, uom, unit_cost, unit_price, line_amount, serial_no, batch_no, notes",
    )
    .eq("gi_id", id)
    .order("line_no", { ascending: true });
  if (lineErr) throw lineErr;

  const itemIds = Array.from(new Set((rawLines ?? []).map((l) => l.item_id)));
  const binIds = Array.from(
    new Set((rawLines ?? []).map((l) => l.bin_id).filter((x): x is string => !!x)),
  );

  const [itemsRes, binsRes] = await Promise.all([
    itemIds.length
      ? supabase.from("items").select("id, code, name").in("id", itemIds)
      : Promise.resolve({ data: [], error: null } as const),
    binIds.length
      ? supabase.from("warehouse_bins").select("id, code, name").in("id", binIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  const itemMap = new Map(
    (itemsRes.data ?? []).map((it) => [it.id, { code: it.code, name: it.name }] as const),
  );
  const binMap = new Map(
    (binsRes.data ?? []).map((b) => [b.id, b.code ?? b.name] as const),
  );

  const lines: InternalSaleIssueLine[] = (rawLines ?? []).map((l) => ({
    id: l.id,
    line_no: l.line_no,
    item_id: l.item_id,
    item_code: itemMap.get(l.item_id)?.code ?? null,
    item_name: itemMap.get(l.item_id)?.name ?? null,
    bin_id: l.bin_id,
    bin_label: l.bin_id ? binMap.get(l.bin_id) ?? null : null,
    qty_issued: Number(l.qty_issued ?? 0),
    uom: l.uom,
    unit_cost: l.unit_cost === null ? null : Number(l.unit_cost),
    unit_price: l.unit_price === null ? null : Number(l.unit_price),
    line_amount: l.line_amount === null ? null : Number(l.line_amount),
    serial_no: l.serial_no,
    batch_no: l.batch_no,
    notes: l.notes,
  }));

  const detailMeta = (row.metadata ?? {}) as Record<string, unknown>;
  const detailAmountTotal = Number(row.amount_total ?? 0);
  const detailToday = new Date().toISOString().slice(0, 10);
  const detailPaymentStatus = resolvePaymentStatus(
    row.status,
    detailAmountTotal,
    row.issue_date,
    detailMeta,
    detailToday,
  );
  const detailExpectedPaymentDate =
    typeof detailMeta.expected_payment_date === "string" &&
    detailMeta.expected_payment_date.length === 10
      ? detailMeta.expected_payment_date
      : null;

  return {
    id: row.id,
    gi_no: row.gi_no,
    brand_id: row.brand_id,
    type: row.type,
    status: row.status,
    warehouse_id: row.warehouse_id,
    warehouse_code: wRes.data?.code ?? null,
    warehouse_name: wRes.data?.name ?? null,
    warehouse_code_full: wRes.data?.code ?? null,
    customer_id: row.customer_id,
    customer_name: cRes.data?.name ?? null,
    destination_store_id: row.destination_store_id,
    destination_store_code: dsRes.data?.code ?? null,
    destination_store_name: dsRes.data?.name ?? null,
    issue_date: row.issue_date,
    qty_issued_total: Number(row.qty_issued_total ?? 0),
    amount_total: detailAmountTotal,
    notes: row.notes,
    delivery_status: row.delivery_status,
    delivery_eta_at: row.delivery_eta_at,
    delivery_address: row.delivery_address,
    recipient_name: row.recipient_name,
    recipient_phone: row.recipient_phone,
    posted_at: row.posted_at,
    voided_at: row.voided_at,
    void_reason: row.void_reason,
    payment_status: detailPaymentStatus,
    expected_payment_date: detailExpectedPaymentDate,
    posted_by_name: postedByRes.data?.display_name ?? null,
    voided_by_name: voidedByRes.data?.display_name ?? null,
    gl_posted: !!row.gl_posted,
    lines,
  };
}

// ─────────────────────────────────────────────────────────────
// Delivery 維護（M04U-20 新增）
// ─────────────────────────────────────────────────────────────
export type UpdateDeliveryInput = {
  destination_store_id?: string | null;
  delivery_eta_at?: string | null; // ISO
  delivery_address?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  delivery_status?: string | null;
};

export async function updateInternalSaleDelivery(
  id: string,
  patch: UpdateDeliveryInput,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.ISSUE_CREATE))) {
    return { ok: false, error: "沒有修改內售出庫單的權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: current, error: curErr } = await supabase
    .from("stock_issues")
    .select("status")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("type", "internal_sale")
    .maybeSingle();
  if (curErr) return { ok: false, error: curErr.message };
  if (!current) return { ok: false, error: "找不到內售出庫單" };
  if (current.status === "cancelled") {
    return { ok: false, error: "已作廢的出庫單不可修改配送資訊" };
  }

  const allowedStatuses = ["pending", "in_transit", "delivered", "cancelled"];
  if (
    patch.delivery_status &&
    !allowedStatuses.includes(patch.delivery_status)
  ) {
    return { ok: false, error: `配送狀態不合法：${patch.delivery_status}` };
  }

  const update: Record<string, unknown> = {};
  if (patch.destination_store_id !== undefined) {
    update.destination_store_id = patch.destination_store_id || null;
  }
  if (patch.delivery_eta_at !== undefined) {
    update.delivery_eta_at = patch.delivery_eta_at || null;
  }
  if (patch.delivery_address !== undefined) {
    update.delivery_address = patch.delivery_address || null;
  }
  if (patch.recipient_name !== undefined) {
    update.recipient_name = patch.recipient_name || null;
  }
  if (patch.recipient_phone !== undefined) {
    update.recipient_phone = patch.recipient_phone || null;
  }
  if (patch.delivery_status !== undefined) {
    update.delivery_status = patch.delivery_status || null;
  }
  if (Object.keys(update).length === 0) {
    return { ok: true, data: { id } };
  }

  const { error: upErr } = await supabase
    .from("stock_issues")
    .update(update)
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath("/parts/issue/internal-sale");
  revalidatePath(`/parts/issue/internal-sale/${id}`);
  return { ok: true, data: { id } };
}

export async function setDeliveryStatus(
  id: string,
  next: "pending" | "in_transit" | "delivered" | "cancelled",
): Promise<Result<{ id: string }>> {
  return updateInternalSaleDelivery(id, { delivery_status: next });
}

// ─────────────────────────────────────────────────────────────
// 應收帳款 — 標記已收款（最小化 visibility-first 功能）
// ─────────────────────────────────────────────────────────────

/**
 * 標記一筆內售出庫為「已收款」。
 *
 * 寫法：把 metadata.payment_received = true + metadata.paid_at 合併進 metadata，
 * 保留既有其他 metadata 欄位（不整包覆蓋）。
 * 不做完整收款對帳，只是 visibility-first 的「已收款」標記。
 */
export async function markInternalSaleReceived(
  id: string,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.ISSUE_CREATE))) {
    return { ok: false, error: "沒有修改內售出庫單的權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();

  // 先撈既有 metadata，才能做合併（不整包覆蓋）
  const { data: current, error: curErr } = await supabase
    .from("stock_issues")
    .select("status, metadata")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("type", "internal_sale")
    .maybeSingle();
  if (curErr) return { ok: false, error: curErr.message };
  if (!current) return { ok: false, error: "找不到內售出庫單" };
  if (current.status === "cancelled") {
    return { ok: false, error: "已作廢的出庫單不可標記收款" };
  }

  const existingMeta = (current.metadata ?? {}) as Record<string, unknown>;
  const updatedMeta: Record<string, unknown> = {
    ...existingMeta,
    payment_received: true,
    paid_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabase
    .from("stock_issues")
    .update({ metadata: updatedMeta })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath("/parts/issue/internal-sale");
  revalidatePath(`/parts/issue/internal-sale/${id}`);
  return { ok: true, data: { id } };
}

/**
 * 給 detail / new 頁面 dropdown 用：只撈當前 brand 的門店清單（不撈 rows）
 */
export async function listDestinationStores(): Promise<StoreOption[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data } = await supabase
    .from("organizations")
    .select("id, code, name")
    .eq("brand_id", scope.brand_id)
    .eq("level", 2)
    .order("code");
  return (data ?? []) as StoreOption[];
}

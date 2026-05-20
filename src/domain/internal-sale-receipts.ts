"use server";

/**
 * Domain Helper — Internal Sale Receipts（內售入庫 §5.2 / M04U-16）
 *
 * 內售入庫 = 內部銷售退回入庫。客戶把已開單的零件退回，重新入到指定倉。
 * 統一走 `stock_receipts` (type='internal_sale_return') + `stock_receipt_lines` 基建，
 * 而非舊 `parts_internal_sale_receipts` summary 表（舊表保留不動）。
 *
 * 業務流程：
 *  1. 建單（draft） — listInternalSaleReceipts / getInternalSaleReceiptById / createInternalSaleReceipt
 *  2. 過帳（draft → completed）— postInternalSaleReceipt 同時寫 stock_items + stock_movements
 *  3. 作廢（completed → cancelled）— voidInternalSaleReceipt 反沖庫存
 *  4. 刪除（draft only） — deleteInternalSaleReceipt
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { INTERNAL_SALE_RECEIPTS_PAGE_SIZE_DEFAULT } from "./internal-sale-receipts.constants";

// ─────────────────────────────────────────────────────────────
// Result 型別
// ─────────────────────────────────────────────────────────────

export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// 型別
// ─────────────────────────────────────────────────────────────

export type InternalSaleReceiptRow = {
  id: string;
  doc_no: string; // stock_receipts.gr_no
  warehouse_id: string;
  warehouse_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  source_doc_id: string | null;
  source_doc_type: string | null;
  source_label: string | null; // 來源 issue 單號 / 客戶名 拼出來顯示用
  receipt_date: string;
  status: string;
  qty_total: number;
  amount_total: number;
  notes: string | null;
  posted_at: string | null;
  created_at: string;
};

export type ListInternalSaleReceiptsFilter = {
  status?: string;
  warehouse_id?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
};

export type ListInternalSaleReceiptsResult = {
  rows: InternalSaleReceiptRow[];
  totalCount: number;
};

export type InternalSaleReceiptKpis = {
  totalCount: number;
  draftCount: number;
  postedCount: number;
  totalQty: number;
  totalAmount: number;
};

export type InternalSaleReceiptLine = {
  id: string;
  line_no: number;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  qty_received: number;
  uom: string;
  unit_cost: number;
  line_amount: number;
  bin_id: string | null;
  notes: string | null;
};

export type InternalSaleReceiptDetail = InternalSaleReceiptRow & {
  posted_by_name: string | null;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
  source_issue_no: string | null;
  lines: InternalSaleReceiptLine[];
};

export type WarehouseOption = { id: string; code: string; name: string };
export type CustomerOption = { id: string; code: string | null; name: string };
export type ItemOption = { id: string; code: string; name: string; uom: string | null };
export type IssueOption = { id: string; doc_no: string; customer_label: string | null };

// ─────────────────────────────────────────────────────────────
// List
// ─────────────────────────────────────────────────────────────

export async function listInternalSaleReceipts(
  filter: ListInternalSaleReceiptsFilter = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<ListInternalSaleReceiptsResult> {
  await requirePermission(PERMISSIONS.RECEIPT_VIEW);
  const supabase = await createClient();
  const scope = await getActiveScope();

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? INTERNAL_SALE_RECEIPTS_PAGE_SIZE_DEFAULT);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("stock_receipts")
    .select(
      "id, gr_no, warehouse_id, customer_id, source_doc_id, source_doc_type, receipt_date, status, qty_received_total, amount_total, notes, posted_at, created_at",
      { count: "exact" },
    )
    .eq("brand_id", scope.brand_id)
    .eq("type", "internal_sale_return")
    .order("receipt_date", { ascending: false })
    .order("gr_no", { ascending: false });

  if (filter.status && filter.status !== "all") q = q.eq("status", filter.status);
  if (filter.warehouse_id) q = q.eq("warehouse_id", filter.warehouse_id);
  if (filter.q) q = q.ilike("gr_no", `%${filter.q}%`);
  if (filter.date_from) q = q.gte("receipt_date", filter.date_from);
  if (filter.date_to) q = q.lte("receipt_date", filter.date_to);

  q = q.range(from, to);
  const { data: rs, error, count } = await q;
  if (error) throw new Error(`internal-sale-receipts: ${error.message}`);
  if (!rs || rs.length === 0) return { rows: [], totalCount: count ?? 0 };

  // 撈 warehouse / customer 名字
  const wIds = Array.from(new Set(rs.map((r) => r.warehouse_id).filter(Boolean)));
  const cIds = Array.from(new Set(rs.map((r) => r.customer_id).filter((x): x is string => !!x)));
  const issueIds = Array.from(
    new Set(
      rs
        .filter((r) => r.source_doc_type === "internal_sale_issue" && r.source_doc_id)
        .map((r) => r.source_doc_id as string),
    ),
  );

  const [wRes, cRes, isRes] = await Promise.all([
    wIds.length
      ? supabase.from("warehouses").select("id, name").in("id", wIds)
      : Promise.resolve({ data: [], error: null } as const),
    cIds.length
      ? supabase.from("customers").select("id, name").in("id", cIds)
      : Promise.resolve({ data: [], error: null } as const),
    issueIds.length
      ? supabase
          .from("parts_internal_sale_issues")
          .select("id, doc_no, customer_label")
          .in("id", issueIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));
  const cMap = new Map((cRes.data ?? []).map((c) => [c.id, c.name]));
  const iMap = new Map(
    (isRes.data ?? []).map((i) => [
      i.id,
      { doc_no: i.doc_no as string, customer_label: i.customer_label as string | null },
    ]),
  );

  const rows: InternalSaleReceiptRow[] = rs.map((r) => {
    const issue = r.source_doc_id ? iMap.get(r.source_doc_id) : null;
    const customer_name = r.customer_id ? cMap.get(r.customer_id) ?? null : null;
    const source_label = issue
      ? `${issue.doc_no}${issue.customer_label ? ` · ${issue.customer_label}` : ""}`
      : customer_name ?? null;
    return {
      id: r.id,
      doc_no: r.gr_no,
      warehouse_id: r.warehouse_id,
      warehouse_name: r.warehouse_id ? wMap.get(r.warehouse_id) ?? null : null,
      customer_id: r.customer_id,
      customer_name,
      source_doc_id: r.source_doc_id,
      source_doc_type: r.source_doc_type,
      source_label,
      receipt_date: r.receipt_date,
      status: r.status,
      qty_total: Number(r.qty_received_total ?? 0),
      amount_total: Number(r.amount_total ?? 0),
      notes: r.notes,
      posted_at: r.posted_at,
      created_at: r.created_at,
    };
  });

  return { rows, totalCount: count ?? rows.length };
}

export async function getInternalSaleReceiptsKpis(): Promise<InternalSaleReceiptKpis> {
  await requirePermission(PERMISSIONS.RECEIPT_VIEW);
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("stock_receipts")
    .select("status, qty_received_total, amount_total")
    .eq("brand_id", scope.brand_id)
    .eq("type", "internal_sale_return");
  if (error) throw new Error(`internal-sale-receipts-kpis: ${error.message}`);

  let draftCount = 0;
  let postedCount = 0;
  let totalQty = 0;
  let totalAmount = 0;
  for (const r of data ?? []) {
    if (r.status === "draft") draftCount += 1;
    if (r.status === "completed") {
      postedCount += 1;
      totalQty += Number(r.qty_received_total ?? 0);
      totalAmount += Number(r.amount_total ?? 0);
    }
  }
  return {
    totalCount: (data ?? []).length,
    draftCount,
    postedCount,
    totalQty,
    totalAmount,
  };
}

export async function getInternalSaleReceiptsPageData(
  filter: ListInternalSaleReceiptsFilter = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{
  rows: InternalSaleReceiptRow[];
  totalCount: number;
  kpis: InternalSaleReceiptKpis;
  warehouseOptions: WarehouseOption[];
  canEdit: boolean;
}> {
  const [{ rows, totalCount }, kpis, warehouseOptions, canEdit] = await Promise.all([
    listInternalSaleReceipts(filter, options),
    getInternalSaleReceiptsKpis(),
    listWarehouseOptions(),
    hasPermission(PERMISSIONS.RECEIPT_CREATE),
  ]);
  return { rows, totalCount, kpis, warehouseOptions, canEdit };
}

// ─────────────────────────────────────────────────────────────
// Detail
// ─────────────────────────────────────────────────────────────

export async function getInternalSaleReceiptById(
  id: string,
): Promise<InternalSaleReceiptDetail | null> {
  await requirePermission(PERMISSIONS.RECEIPT_VIEW);
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: r, error } = await supabase
    .from("stock_receipts")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("type", "internal_sale_return")
    .maybeSingle();
  if (error) throw new Error(`internal-sale-receipt: ${error.message}`);
  if (!r) return null;

  // lines + 名字
  const [wRes, cRes, postRes, voidRes, issueRes, lineRes] = await Promise.all([
    r.warehouse_id
      ? supabase.from("warehouses").select("name").eq("id", r.warehouse_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    r.customer_id
      ? supabase.from("customers").select("name").eq("id", r.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    r.posted_by
      ? supabase.from("profiles").select("display_name").eq("id", r.posted_by).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    r.voided_by
      ? supabase.from("profiles").select("display_name").eq("id", r.voided_by).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    r.source_doc_type === "internal_sale_issue" && r.source_doc_id
      ? supabase
          .from("parts_internal_sale_issues")
          .select("doc_no, customer_label")
          .eq("id", r.source_doc_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    supabase
      .from("stock_receipt_lines")
      .select("id, line_no, item_id, qty_received, uom, unit_cost, line_amount, bin_id, notes")
      .eq("gr_id", id)
      .order("line_no", { ascending: true }),
  ]);
  if (lineRes.error) throw lineRes.error;

  const rawLines = lineRes.data ?? [];
  const itemIds = Array.from(new Set(rawLines.map((l) => l.item_id)));
  const itRes =
    itemIds.length > 0
      ? await supabase.from("items").select("id, code, name").in("id", itemIds)
      : { data: [] as { id: string; code: string; name: string }[], error: null };
  const itMap = new Map((itRes.data ?? []).map((i) => [i.id, { code: i.code, name: i.name }]));

  const lines: InternalSaleReceiptLine[] = rawLines.map((l) => ({
    id: l.id,
    line_no: l.line_no,
    item_id: l.item_id,
    item_code: itMap.get(l.item_id)?.code ?? null,
    item_name: itMap.get(l.item_id)?.name ?? null,
    qty_received: Number(l.qty_received ?? 0),
    uom: l.uom,
    unit_cost: Number(l.unit_cost ?? 0),
    line_amount: Number(l.line_amount ?? 0),
    bin_id: l.bin_id,
    notes: l.notes,
  }));

  const issue = issueRes.data;
  const customer_name = cRes.data?.name ?? null;
  const source_label = issue
    ? `${issue.doc_no}${issue.customer_label ? ` · ${issue.customer_label}` : ""}`
    : customer_name;

  return {
    id: r.id,
    doc_no: r.gr_no,
    warehouse_id: r.warehouse_id,
    warehouse_name: wRes.data?.name ?? null,
    customer_id: r.customer_id,
    customer_name,
    source_doc_id: r.source_doc_id,
    source_doc_type: r.source_doc_type,
    source_label,
    receipt_date: r.receipt_date,
    status: r.status,
    qty_total: Number(r.qty_received_total ?? 0),
    amount_total: Number(r.amount_total ?? 0),
    notes: r.notes,
    posted_at: r.posted_at,
    created_at: r.created_at,
    posted_by_name: postRes.data?.display_name ?? null,
    voided_at: r.voided_at,
    voided_by_name: voidRes.data?.display_name ?? null,
    void_reason: r.void_reason,
    source_issue_no: issue?.doc_no ?? null,
    lines,
  };
}

// ─────────────────────────────────────────────────────────────
// Lookups
// ─────────────────────────────────────────────────────────────

export async function listWarehouseOptions(): Promise<WarehouseOption[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("warehouses")
    .select("id, code, name")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(`warehouses: ${error.message}`);
  return (data ?? []) as WarehouseOption[];
}

export async function listCustomerOptions(): Promise<CustomerOption[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("customers")
    .select("id, code, name")
    .eq("brand_id", scope.brand_id)
    .order("name")
    .limit(200);
  if (error) throw new Error(`customers: ${error.message}`);
  return (data ?? []) as CustomerOption[];
}

export async function listItemOptions(): Promise<ItemOption[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("items")
    .select("id, code, name, uom")
    .eq("brand_id", scope.brand_id)
    .order("code")
    .limit(500);
  if (error) throw new Error(`items: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; code: string; name: string; uom: string | null }>).map(
    (i) => ({ id: i.id, code: i.code, name: i.name, uom: i.uom }),
  );
}

export async function listIssueOptions(): Promise<IssueOption[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("parts_internal_sale_issues")
    .select("id, doc_no, customer_label")
    .eq("brand_id", scope.brand_id)
    .order("issue_date", { ascending: false })
    .limit(100);
  if (error) throw new Error(`internal-sale-issues: ${error.message}`);
  return (data ?? []) as IssueOption[];
}

export async function getNewPageLookups(): Promise<{
  warehouses: WarehouseOption[];
  customers: CustomerOption[];
  items: ItemOption[];
  issues: IssueOption[];
}> {
  await requirePermission(PERMISSIONS.RECEIPT_CREATE);
  const [warehouses, customers, items, issues] = await Promise.all([
    listWarehouseOptions(),
    listCustomerOptions(),
    listItemOptions(),
    listIssueOptions(),
  ]);
  return { warehouses, customers, items, issues };
}

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

export type CreateInternalSaleReceiptInput = {
  warehouse_id: string;
  customer_id?: string | null;
  source_issue_id?: string | null;
  receipt_date?: string;
  notes?: string | null;
  lines: Array<{
    item_id: string;
    qty_received: number;
    unit_cost: number;
    uom?: string;
    bin_id?: string | null;
    notes?: string | null;
  }>;
};

/**
 * 建立內售入庫單（draft 狀態，尚未過帳，不寫 stock_items）。
 * 過帳要另外呼叫 postInternalSaleReceipt。
 */
export async function createInternalSaleReceipt(
  input: CreateInternalSaleReceiptInput,
): Promise<Result<{ id: string; doc_no: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有建立內售入庫單的權限" };
  }
  if (!input.warehouse_id) return { ok: false, error: "請選擇入庫倉" };
  if (!input.lines?.length) return { ok: false, error: "至少需要一筆入庫明細" };
  for (const [i, l] of input.lines.entries()) {
    if (!l.item_id) return { ok: false, error: `第 ${i + 1} 行請選擇品項` };
    if (!l.qty_received || l.qty_received <= 0)
      return { ok: false, error: `第 ${i + 1} 行數量需大於 0` };
    if (l.unit_cost == null || l.unit_cost < 0)
      return { ok: false, error: `第 ${i + 1} 行成本需 ≥ 0` };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();

  // 產 doc no：IRT yyyymmdd-NNN（Internal sale Return / Receipt）
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const { data: last } = await supabase
    .from("stock_receipts")
    .select("gr_no")
    .like("gr_no", `IRT${dateStr}-%`)
    .order("gr_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (last?.gr_no) {
    const m = last.gr_no.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  const doc_no = `IRT${dateStr}-${String(seq).padStart(3, "0")}`;

  const linesWithAmount = input.lines.map((l, idx) => ({
    line_no: idx + 1,
    item_id: l.item_id,
    qty_received: l.qty_received,
    unit_cost: l.unit_cost,
    uom: l.uom ?? "個",
    bin_id: l.bin_id ?? null,
    line_amount: Math.round(l.qty_received * l.unit_cost * 100) / 100,
    notes: l.notes ?? null,
    source_line_type: input.source_issue_id ? "internal_sale_issue" : null,
  }));
  const totalQty = linesWithAmount.reduce((s, l) => s + l.qty_received, 0);
  const totalAmount = linesWithAmount.reduce((s, l) => s + l.line_amount, 0);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const insertHeader: Record<string, unknown> = {
    brand_id: scope.brand_id,
    gr_no: doc_no,
    type: "internal_sale_return",
    warehouse_id: input.warehouse_id,
    customer_id: input.customer_id ?? null,
    receipt_date: input.receipt_date ?? today.toISOString().slice(0, 10),
    notes: input.notes ?? null,
    qty_received_total: totalQty,
    amount_total: totalAmount,
    status: "draft",
    created_by: user?.id ?? null,
  };
  if (input.source_issue_id) {
    insertHeader.source_doc_id = input.source_issue_id;
    insertHeader.source_doc_type = "internal_sale_issue";
  }

  const { data: header, error: hErr } = await supabase
    .from("stock_receipts")
    .insert(insertHeader)
    .select("id")
    .single();
  if (hErr || !header) {
    return { ok: false, error: `建立入庫單失敗：${hErr?.message ?? "no row"}` };
  }

  const linesToInsert = linesWithAmount.map((l) => ({
    ...l,
    gr_id: header.id,
    brand_id: scope.brand_id,
  }));
  const { error: lErr } = await supabase.from("stock_receipt_lines").insert(linesToInsert);
  if (lErr) {
    // rollback header
    await supabase.from("stock_receipts").delete().eq("id", header.id);
    return { ok: false, error: `建立明細失敗：${lErr.message}` };
  }

  revalidatePath("/parts/receipt/internal-sale");
  return { ok: true, data: { id: header.id, doc_no } };
}

export type UpdateInternalSaleReceiptInput = {
  receipt_date?: string;
  notes?: string | null;
};

/** 修改入庫單 — draft 才可改、僅允許 receipt_date / notes。已過帳走 voidInternalSaleReceipt + 重建。 */
export async function updateInternalSaleReceipt(
  id: string,
  patch: UpdateInternalSaleReceiptInput,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有修改內售入庫單的權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: current } = await supabase
    .from("stock_receipts")
    .select("status")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("type", "internal_sale_return")
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到入庫單" };
  if (current.status === "cancelled") return { ok: false, error: "已作廢的入庫單不可修改" };

  const headerPatch: Record<string, unknown> = {};
  if (patch.receipt_date !== undefined) headerPatch.receipt_date = patch.receipt_date;
  if (patch.notes !== undefined) headerPatch.notes = patch.notes;
  if (Object.keys(headerPatch).length === 0) return { ok: true, data: { id } };

  // completed 也允許改 notes / receipt_date，跟 receipts.ts 一致
  const { error } = await supabase.from("stock_receipts").update(headerPatch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/parts/receipt/internal-sale");
  revalidatePath(`/parts/receipt/internal-sale/${id}`);
  return { ok: true, data: { id } };
}

/** 過帳：draft → completed，寫 stock_items + stock_movements。 */
export async function postInternalSaleReceipt(id: string): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有過帳內售入庫單的權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: header } = await supabase
    .from("stock_receipts")
    .select("id, status, warehouse_id")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("type", "internal_sale_return")
    .maybeSingle();
  if (!header) return { ok: false, error: "找不到入庫單" };
  if (header.status !== "draft")
    return { ok: false, error: `狀態 ${header.status} 不可過帳（需為草稿）` };

  const { data: lines, error: lErr } = await supabase
    .from("stock_receipt_lines")
    .select("id, item_id, qty_received, unit_cost, bin_id")
    .eq("gr_id", id);
  if (lErr) return { ok: false, error: lErr.message };
  if (!lines || lines.length === 0) return { ok: false, error: "此入庫單無明細，無法過帳" };

  // 寫 stock_items
  const stockItems = lines.map((l) => ({
    brand_id: scope.brand_id,
    item_id: l.item_id,
    warehouse_id: header.warehouse_id,
    bin_id: l.bin_id,
    qty: Number(l.qty_received ?? 0),
    unit_cost: Number(l.unit_cost ?? 0),
    status: "available",
    source_receipt_line_id: l.id,
  }));
  const { error: siErr } = await supabase.from("stock_items").insert(stockItems);
  if (siErr) return { ok: false, error: `寫入庫存失敗：${siErr.message}` };

  // 寫 stock_movements（direction='in'）
  const movements = lines.map((l) => ({
    brand_id: scope.brand_id,
    item_id: l.item_id,
    warehouse_id: header.warehouse_id,
    direction: "in",
    qty: Number(l.qty_received ?? 0),
    reason: "internal_sale_return",
    source_table: "stock_receipts",
    source_id: id,
  }));
  const { error: smErr } = await supabase.from("stock_movements").insert(movements);
  if (smErr) {
    // 回滾 stock_items
    await supabase.from("stock_items").delete().in(
      "source_receipt_line_id",
      lines.map((l) => l.id),
    );
    return { ok: false, error: `寫入庫存異動 log 失敗：${smErr.message}` };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error: upErr } = await supabase
    .from("stock_receipts")
    .update({
      status: "completed",
      posted_at: new Date().toISOString(),
      posted_by: user?.id ?? null,
    })
    .eq("id", id);
  if (upErr) return { ok: false, error: `更新狀態失敗：${upErr.message}` };

  revalidatePath("/parts/receipt/internal-sale");
  revalidatePath(`/parts/receipt/internal-sale/${id}`);
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { id } };
}

/** 作廢：completed → cancelled，反沖 stock_items + 寫反向 stock_movements。 */
export async function voidInternalSaleReceipt(
  id: string,
  reason: string,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有作廢內售入庫單的權限" };
  }
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "請填寫作廢原因" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: header } = await supabase
    .from("stock_receipts")
    .select("id, status, warehouse_id")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("type", "internal_sale_return")
    .maybeSingle();
  if (!header) return { ok: false, error: "找不到入庫單" };
  if (header.status === "cancelled") return { ok: false, error: "此入庫單已作廢" };
  if (header.status !== "completed")
    return { ok: false, error: `狀態 ${header.status} 不可作廢（需為已過帳）` };

  const { data: lines } = await supabase
    .from("stock_receipt_lines")
    .select("id, item_id, qty_received")
    .eq("gr_id", id);
  if (!lines || lines.length === 0) return { ok: false, error: "此入庫單無明細，無法作廢" };

  const lineIds = lines.map((l) => l.id);
  const { data: stockItems } = await supabase
    .from("stock_items")
    .select("id, status, source_receipt_line_id")
    .in("source_receipt_line_id", lineIds);
  const consumed = (stockItems ?? []).filter((s) => s.status !== "available");
  if (consumed.length > 0) {
    return {
      ok: false,
      error: `${consumed.length} 筆庫存已被消耗（出貨／調撥／領料），不可作廢`,
    };
  }

  if (stockItems && stockItems.length > 0) {
    const { error: delErr } = await supabase
      .from("stock_items")
      .delete()
      .in(
        "id",
        stockItems.map((s) => s.id),
      );
    if (delErr) return { ok: false, error: `庫存沖回失敗：${delErr.message}` };
  }

  // 寫反向 stock_movements（direction='out'，作廢沖回視為一筆出倉）
  const movements = lines.map((l) => ({
    brand_id: scope.brand_id,
    item_id: l.item_id,
    warehouse_id: header.warehouse_id,
    direction: "out",
    qty: Number(l.qty_received ?? 0),
    reason: "internal_sale_return_void",
    source_table: "stock_receipts",
    source_id: id,
  }));
  await supabase.from("stock_movements").insert(movements);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error: voidErr } = await supabase
    .from("stock_receipts")
    .update({
      status: "cancelled",
      voided_at: new Date().toISOString(),
      voided_by: user?.id ?? null,
      void_reason: trimmed,
    })
    .eq("id", id);
  if (voidErr) return { ok: false, error: `標記作廢失敗：${voidErr.message}` };

  revalidatePath("/parts/receipt/internal-sale");
  revalidatePath(`/parts/receipt/internal-sale/${id}`);
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { id } };
}

/** 刪除：僅 draft 可刪。連同 lines 刪除。 */
export async function deleteInternalSaleReceipt(
  id: string,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有刪除內售入庫單的權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: header } = await supabase
    .from("stock_receipts")
    .select("id, status")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("type", "internal_sale_return")
    .maybeSingle();
  if (!header) return { ok: false, error: "找不到入庫單" };
  if (header.status !== "draft")
    return { ok: false, error: `狀態 ${header.status} 不可刪除（需為草稿）` };

  // lines 先刪
  await supabase.from("stock_receipt_lines").delete().eq("gr_id", id);
  const { error: delErr } = await supabase.from("stock_receipts").delete().eq("id", id);
  if (delErr) return { ok: false, error: `刪除失敗：${delErr.message}` };

  revalidatePath("/parts/receipt/internal-sale");
  return { ok: true, data: { id } };
}

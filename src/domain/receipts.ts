"use server";

/**
 * Domain Helper — Stock Receipts（入庫單）
 *
 * Read：listReceipts / getReceiptsPageData
 * Mutations：receiveStock（從 src/lib/parts/actions/index.ts 遷入；Result<T> 沿用 domain 慣例）
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { instantiateTransaction, TX_TYPES } from "@/domain/transactions";
import { RECEIPTS_PAGE_SIZE_DEFAULT } from "@/domain/receipts.constants";

import type { Database } from "@/lib/database.types";

// ─────────────────────────────────────────────────────────────
// Result 型別（client 自控導航的 ok/error pattern）
// ─────────────────────────────────────────────────────────────

export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type Tables = Database["public"]["Tables"];
export type StockReceiptRow = Tables["stock_receipts"]["Row"];

export type StockReceiptListRow = StockReceiptRow & {
  vendor_name: string | null;
  warehouse_name: string | null;
};

export type ListReceiptsFilter = {
  type?: string;
  status?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
};

export type ListReceiptsResult = {
  rows: StockReceiptListRow[];
  totalCount: number;
};

export async function listReceipts(
  filter: ListReceiptsFilter = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<ListReceiptsResult> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? RECEIPTS_PAGE_SIZE_DEFAULT);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("stock_receipts")
    .select("*", { count: "exact" })
    .eq("brand_id", scope.brand_id)
    .order("receipt_date", { ascending: false })
    .order("gr_no", { ascending: false });
  if (filter.type) q = q.eq("type", filter.type);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.q) q = q.ilike("gr_no", `%${filter.q}%`);
  if (filter.date_from) q = q.gte("receipt_date", filter.date_from);
  if (filter.date_to) q = q.lte("receipt_date", filter.date_to);
  q = q.range(from, to);

  const { data: rs, error, count } = await q;
  if (error) throw error;
  if (!rs || rs.length === 0) return { rows: [], totalCount: count ?? 0 };

  const vIds = Array.from(new Set(rs.map((r) => r.vendor_id).filter((x): x is string => !!x)));
  const wIds = Array.from(new Set(rs.map((r) => r.warehouse_id).filter((x): x is string => !!x)));

  const [vRes, wRes] = await Promise.all([
    vIds.length > 0
      ? supabase.from("suppliers").select("id, name").in("id", vIds)
      : Promise.resolve({ data: [], error: null }),
    wIds.length > 0
      ? supabase.from("warehouses").select("id, name").in("id", wIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (vRes.error) throw vRes.error;
  if (wRes.error) throw wRes.error;
  const vMap = new Map((vRes.data ?? []).map((v) => [v.id, v.name]));
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  const rows = rs.map((r) => ({
    ...r,
    vendor_name: r.vendor_id ? vMap.get(r.vendor_id) ?? null : null,
    warehouse_name: r.warehouse_id ? wMap.get(r.warehouse_id) ?? null : null,
  }));
  return { rows, totalCount: count ?? rows.length };
}

export async function getReceiptsPageData(
  filter: ListReceiptsFilter = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{
  rows: StockReceiptListRow[];
  totalCount: number;
  canEdit: boolean;
}> {
  const [{ rows, totalCount }, canEdit] = await Promise.all([
    listReceipts(filter, options),
    hasPermission(PERMISSIONS.RECEIPT_CREATE),
  ]);
  return { rows, totalCount, canEdit };
}

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

export type ReceiveStockInput = {
  po_id: string;
  receipt_date?: string;
  notes?: string;
  lines: Array<{
    po_line_id: string;
    item_id: string;
    qty_received: number;
    bin_id?: string;
    serial_no?: string;
    batch_no?: string;
    unit_cost?: number;
  }>;
};

/** 採購入庫:建 GR + GR lines,產生 stock_items,扣 PO line received_qty */
export async function receiveStock(
  input: ReceiveStockInput,
): Promise<Result<{ receipt_id: string; gr_no: string }>> {
  if (!input.po_id) return { ok: false, error: "缺 po_id" };
  if (!input.lines?.length) return { ok: false, error: "至少需要一筆收貨明細" };

  const supabase = await createClient();

  // 1. 撈 PO 確認狀態 + warehouse
  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id, po_no, vendor_id, warehouse_id, status")
    .eq("id", input.po_id)
    .single();
  if (poErr || !po) return { ok: false, error: `找不到 PO:${poErr?.message ?? "no row"}` };
  if (!["approved", "partial_received"].includes(po.status)) {
    return { ok: false, error: `PO 狀態 ${po.status} 不可收貨(需 approved 或 partial_received)` };
  }

  // 2. 產 GR 號 GR + yyyymmdd-NNN
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const { data: lastGR } = await supabase
    .from("stock_receipts")
    .select("gr_no")
    .like("gr_no", `GR${dateStr}-%`)
    .order("gr_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (lastGR?.gr_no) {
    const m = lastGR.gr_no.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  const gr_no = `GR${dateStr}-${String(seq).padStart(3, "0")}`;

  // 3. 撈 PO lines unit_price 當預設 unit_cost
  const poLineIds = input.lines.map((l) => l.po_line_id);
  const { data: poLines } = await supabase
    .from("purchase_order_lines")
    .select("id, unit_price, qty_ordered, qty_received")
    .in("id", poLineIds);
  const priceMap = new Map((poLines ?? []).map((l) => [l.id, l.unit_price]));

  // 4. 計算 GR 金額
  const grLinesWithAmount = input.lines.map((l, idx) => {
    const unit_cost = l.unit_cost ?? priceMap.get(l.po_line_id) ?? 0;
    return {
      line_no: idx + 1,
      item_id: l.item_id,
      qty_received: l.qty_received,
      unit_cost,
      uom: "PCS",
      bin_id: l.bin_id ?? null,
      line_amount: Math.round(l.qty_received * unit_cost * 100) / 100,
      source_line_id: l.po_line_id,
      source_line_type: "po_line",
    };
  });
  const totalQty = input.lines.reduce((s, l) => s + l.qty_received, 0);
  const totalAmount = grLinesWithAmount.reduce((s, l) => s + l.line_amount, 0);

  // 5. Insert GR
  const { data: gr, error: grErr } = await supabase
    .from("stock_receipts")
    .insert({
      gr_no,
      type: "purchase",
      warehouse_id: po.warehouse_id,
      vendor_id: po.vendor_id,
      receipt_date: input.receipt_date ?? today.toISOString().slice(0, 10),
      notes: input.notes ?? null,
      qty_received_total: totalQty,
      amount_total: totalAmount,
      source_doc_id: po.id,
      source_doc_type: "purchase_order",
      status: "completed",
      posted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (grErr) return { ok: false, error: `建立 GR 失敗:${grErr.message}` };

  // 6. Insert GR lines
  const grLinesToInsert = grLinesWithAmount.map((l) => ({ ...l, gr_id: gr.id }));
  const { data: grLines, error: grLinesErr } = await supabase
    .from("stock_receipt_lines")
    .insert(grLinesToInsert)
    .select("id, item_id, qty_received, unit_cost, bin_id");
  if (grLinesErr || !grLines) {
    await supabase.from("stock_receipts").delete().eq("id", gr.id);
    return { ok: false, error: `建立 GR 明細失敗:${grLinesErr?.message ?? ""}` };
  }

  // 7. 產生 stock_items(每張 GR line 對應 1+ 條 stock_item)
  // 量產(qty 類):一條 row qty=qty_received
  // 序列號類:展開為 N 條 qty=1 — 但目前 input 沒帶序列號明細,先一條合計
  const scope = await getActiveScope();
  const inputLineByPoLineId = new Map(input.lines.map((l) => [l.po_line_id, l]));
  const stockItems = grLines.map((grLine, idx) => {
    const inputLine = input.lines[idx];
    return {
      brand_id: scope.brand_id,
      item_id: grLine.item_id,
      warehouse_id: po.warehouse_id,
      bin_id: grLine.bin_id,
      qty: grLine.qty_received,
      unit_cost: grLine.unit_cost,
      status: "available",
      source_receipt_line_id: grLine.id,
      serial_no: inputLine?.serial_no ?? null,
      batch_no: inputLine?.batch_no ?? null,
    };
  });
  const { error: stockErr } = await supabase
    .from("stock_items")
    .insert(stockItems);
  if (stockErr) {
    return { ok: false, error: `產生庫存失敗(GR ${gr_no} 已建立):${stockErr.message}` };
  }

  // 8. 更新 PO line received_qty
  for (const inputLine of input.lines) {
    const poLine = poLines?.find((p) => p.id === inputLine.po_line_id);
    if (!poLine) continue;
    await supabase
      .from("purchase_order_lines")
      .update({
        qty_received: (poLine.qty_received ?? 0) + inputLine.qty_received,
      })
      .eq("id", inputLine.po_line_id);
  }

  // 9. 更新 PO 整單進度
  const { data: allPoLines } = await supabase
    .from("purchase_order_lines")
    .select("qty_ordered, qty_received")
    .eq("po_id", po.id);
  const totalOrdered = (allPoLines ?? []).reduce((s, l) => s + l.qty_ordered, 0);
  const totalReceived = (allPoLines ?? []).reduce((s, l) => s + (l.qty_received ?? 0), 0);
  const progressPct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
  const newStatus = progressPct >= 100 ? "received" : "partial_received";
  await supabase
    .from("purchase_orders")
    .update({
      qty_received_total: totalReceived,
      receipt_progress_pct: progressPct,
      status: newStatus,
      ...(newStatus === "received" ? { closed_at: new Date().toISOString() } : {}),
    })
    .eq("id", po.id);

  void inputLineByPoLineId; // 防 unused warning

  // 10. 自動產會計分錄（PARTS_PURCHASE）— 非阻塞、autoPost 直接 posted
  // POC 階段限制：
  //   - 整單聚合成一張 entry，item_id 取第一筆代表（多 item 拆細分錄屬 engine v2）
  //   - SUBSIDIARY 軸由 engine normalizeSubsidiaryChain 自動從 warehouse_id 兩跳補
  const receiptDate = input.receipt_date ?? today.toISOString().slice(0, 10);
  const firstGrLine = grLinesWithAmount[0];
  if (firstGrLine && po.vendor_id) {
    const netAmount = Math.round(totalAmount * 100) / 100;
    const taxAmount = Math.round(netAmount * 0.05 * 100) / 100;
    after(async () => {
      const res = await instantiateTransaction(
        TX_TYPES.PARTS_PURCHASE,
        {
          supplier_id: po.vendor_id,
          item_id: firstGrLine.item_id,
          net_amount: netAmount,
          tax_amount: taxAmount,
          warehouse_id: po.warehouse_id,
        },
        { autoPost: true, entryDate: receiptDate },
      );
      if (!res.ok) {
        console.error("[accounting] PARTS_PURCHASE 自動過帳失敗", {
          gr_no,
          error: res.error,
        });
      } else {
        console.log("[accounting] PARTS_PURCHASE 已自動過帳（posted）", {
          gr_no,
          journal_entry: res.data,
        });
      }
    });
  }

  revalidatePath("/parts/purchase/orders");
  revalidatePath("/parts/receipt/po-grn");
  revalidatePath("/parts/operations/balance");
  revalidatePath("/parts/operations/receipts-history");
  return { ok: true, data: { receipt_id: gr.id, gr_no } };
}

// ─────────────────────────────────────────────────────────────
// Detail / Update / Void
// ─────────────────────────────────────────────────────────────

export type StockReceiptDetailLine = {
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
  bin_label: string | null;
  notes: string | null;
};

export type StockReceiptDetail = StockReceiptRow & {
  vendor_name: string | null;
  warehouse_name: string | null;
  source_po_no: string | null;
  source_gi_no: string | null;
  source_tr_no: string | null;
  posted_by_name: string | null;
  voided_by_name: string | null;
  lines: StockReceiptDetailLine[];
};

export async function getReceiptById(
  id: string,
): Promise<StockReceiptDetail | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: r, error } = await supabase
    .from("stock_receipts")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (error) throw error;
  if (!r) return null;

  // join 來源單號（依 source_doc_type 分流）
  let source_po_no: string | null = null;
  let source_gi_no: string | null = null;
  let source_tr_no: string | null = null;
  if (r.source_doc_id && r.source_doc_type) {
    if (r.source_doc_type === "purchase_order") {
      const { data: po } = await supabase
        .from("purchase_orders")
        .select("po_no")
        .eq("id", r.source_doc_id)
        .maybeSingle();
      source_po_no = po?.po_no ?? null;
    } else if (r.source_doc_type === "stock_issue") {
      const { data: gi } = await supabase
        .from("stock_issues")
        .select("gi_no")
        .eq("id", r.source_doc_id)
        .maybeSingle();
      source_gi_no = gi?.gi_no ?? null;
    } else if (r.source_doc_type === "stock_transfer") {
      const { data: tr } = await supabase
        .from("stock_transfers")
        .select("tr_no")
        .eq("id", r.source_doc_id)
        .maybeSingle();
      source_tr_no = tr?.tr_no ?? null;
    }
  }

  // vendor / warehouse / posted_by / voided_by 名字
  const [vRes, wRes, postRes, voidRes] = await Promise.all([
    r.vendor_id
      ? supabase.from("suppliers").select("name").eq("id", r.vendor_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    r.warehouse_id
      ? supabase.from("warehouses").select("name").eq("id", r.warehouse_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    r.posted_by
      ? supabase.from("profiles").select("display_name").eq("id", r.posted_by).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    r.voided_by
      ? supabase.from("profiles").select("display_name").eq("id", r.voided_by).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
  ]);

  // lines + item + bin join
  const { data: rawLines, error: lineErr } = await supabase
    .from("stock_receipt_lines")
    .select(
      "id, line_no, item_id, qty_received, uom, unit_cost, line_amount, bin_id, notes",
    )
    .eq("gr_id", id)
    .order("line_no", { ascending: true });
  if (lineErr) throw lineErr;

  const itemIds = Array.from(new Set((rawLines ?? []).map((l) => l.item_id)));
  const binIds = Array.from(
    new Set(
      (rawLines ?? [])
        .map((l) => l.bin_id)
        .filter((x): x is string => !!x),
    ),
  );
  const [itemsRes, binsRes] = await Promise.all([
    itemIds.length
      ? supabase.from("items").select("id, code, name").in("id", itemIds)
      : Promise.resolve({ data: [], error: null } as const),
    binIds.length
      ? supabase.from("warehouse_bins").select("id, code").in("id", binIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);
  const itemMap = new Map(
    (itemsRes.data ?? []).map((it) => [it.id, { code: it.code, name: it.name }]),
  );
  const binMap = new Map((binsRes.data ?? []).map((b) => [b.id, b.code]));

  const lines: StockReceiptDetailLine[] = (rawLines ?? []).map((l) => ({
    id: l.id,
    line_no: l.line_no,
    item_id: l.item_id,
    item_code: itemMap.get(l.item_id)?.code ?? null,
    item_name: itemMap.get(l.item_id)?.name ?? null,
    qty_received: Number(l.qty_received ?? 0),
    uom: l.uom,
    unit_cost: Number(l.unit_cost ?? 0),
    line_amount: Number(l.line_amount ?? 0),
    bin_id: l.bin_id,
    bin_label: l.bin_id ? binMap.get(l.bin_id) ?? null : null,
    notes: l.notes,
  }));

  return {
    ...r,
    vendor_name: vRes.data?.name ?? null,
    warehouse_name: wRes.data?.name ?? null,
    source_po_no,
    source_gi_no,
    source_tr_no,
    posted_by_name: postRes.data?.display_name ?? null,
    voided_by_name: voidRes.data?.display_name ?? null,
    lines,
  };
}

export type UpdateReceiptInput = {
  notes?: string | null;
  receipt_date?: string;
  line_notes?: Array<{ id: string; notes: string | null }>;
};

/**
 * 更新入庫單 — 受限欄位：notes / receipt_date / 明細行 notes
 * 過帳後不允許改 qty / unit_cost / item / warehouse / vendor
 */
export async function updateReceipt(
  id: string,
  patch: UpdateReceiptInput,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有編輯入庫單的權限" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();

  // 守門：cancelled 狀態不可改
  const { data: current, error: curErr } = await supabase
    .from("stock_receipts")
    .select("status")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (curErr) return { ok: false, error: curErr.message };
  if (!current) return { ok: false, error: "找不到入庫單" };
  if (current.status === "cancelled") {
    return { ok: false, error: "已作廢的入庫單不可修改" };
  }

  const headerPatch: Record<string, unknown> = {};
  if (patch.notes !== undefined) headerPatch.notes = patch.notes;
  if (patch.receipt_date !== undefined) headerPatch.receipt_date = patch.receipt_date;

  if (Object.keys(headerPatch).length > 0) {
    const { error: upErr } = await supabase
      .from("stock_receipts")
      .update(headerPatch)
      .eq("id", id);
    if (upErr) return { ok: false, error: upErr.message };
  }

  if (patch.line_notes && patch.line_notes.length > 0) {
    for (const ln of patch.line_notes) {
      const { error: lnErr } = await supabase
        .from("stock_receipt_lines")
        .update({ notes: ln.notes })
        .eq("id", ln.id)
        .eq("gr_id", id);
      if (lnErr) return { ok: false, error: `明細備註更新失敗:${lnErr.message}` };
    }
  }

  revalidatePath("/parts/receipt/po-grn");
  revalidatePath(`/parts/receipt/po-grn/${id}`);
  return { ok: true, data: { id } };
}

/**
 * 作廢入庫單 — 反向沖回 stock_items + 還原 PO line qty_received + 還原 PO 狀態
 * 守門：任一 stock_item.status != 'available'（已被消耗）→ 阻擋
 */
export async function voidReceipt(
  id: string,
  reason: string,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有作廢入庫單的權限" };
  }
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "請填寫作廢原因" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  // 1. 撈入庫單 + lines
  const { data: gr, error: grErr } = await supabase
    .from("stock_receipts")
    .select("id, status, source_doc_id, source_doc_type")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (grErr) return { ok: false, error: grErr.message };
  if (!gr) return { ok: false, error: "找不到入庫單" };
  if (gr.status === "cancelled") return { ok: false, error: "此入庫單已作廢" };
  if (gr.status !== "completed" && gr.status !== "posted") {
    return { ok: false, error: `狀態 ${gr.status} 不可作廢` };
  }

  const { data: lines, error: lineErr } = await supabase
    .from("stock_receipt_lines")
    .select("id, source_line_id, source_line_type, qty_received")
    .eq("gr_id", id);
  if (lineErr) return { ok: false, error: lineErr.message };
  if (!lines || lines.length === 0) {
    return { ok: false, error: "此入庫單無明細，無法作廢" };
  }

  // 2. 守門：檢查 stock_items 是否都還 available
  const lineIds = lines.map((l) => l.id);
  const { data: stockItems, error: siErr } = await supabase
    .from("stock_items")
    .select("id, status, source_receipt_line_id")
    .in("source_receipt_line_id", lineIds);
  if (siErr) return { ok: false, error: siErr.message };
  const consumed = (stockItems ?? []).filter((s) => s.status !== "available");
  if (consumed.length > 0) {
    return {
      ok: false,
      error: `${consumed.length} 筆庫存已被消耗（出貨／調撥／領料），不可作廢；請先處理後續單據`,
    };
  }

  // 3. 刪 stock_items
  if (stockItems && stockItems.length > 0) {
    const { error: delErr } = await supabase
      .from("stock_items")
      .delete()
      .in(
        "id",
        stockItems.map((s) => s.id),
      );
    if (delErr) return { ok: false, error: `庫存沖回失敗:${delErr.message}` };
  }

  // 4. 還原 PO line qty_received
  const poLineMap = new Map<string, number>();
  for (const l of lines) {
    if (l.source_line_type === "po_line" && l.source_line_id) {
      poLineMap.set(
        l.source_line_id,
        (poLineMap.get(l.source_line_id) ?? 0) + Number(l.qty_received ?? 0),
      );
    }
  }
  if (poLineMap.size > 0) {
    const poLineIds = Array.from(poLineMap.keys());
    const { data: poLineRows } = await supabase
      .from("purchase_order_lines")
      .select("id, qty_received")
      .in("id", poLineIds);
    for (const row of poLineRows ?? []) {
      const subtract = poLineMap.get(row.id) ?? 0;
      const next = Math.max(0, Number(row.qty_received ?? 0) - subtract);
      await supabase
        .from("purchase_order_lines")
        .update({ qty_received: next })
        .eq("id", row.id);
    }
  }

  // 5. 還原 PO 整單狀態
  if (gr.source_doc_type === "purchase_order" && gr.source_doc_id) {
    const { data: allPoLines } = await supabase
      .from("purchase_order_lines")
      .select("qty_ordered, qty_received")
      .eq("po_id", gr.source_doc_id);
    const totalOrdered = (allPoLines ?? []).reduce(
      (s, l) => s + Number(l.qty_ordered ?? 0),
      0,
    );
    const totalReceived = (allPoLines ?? []).reduce(
      (s, l) => s + Number(l.qty_received ?? 0),
      0,
    );
    const pct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
    const newStatus = pct >= 100 ? "received" : pct > 0 ? "partial_received" : "approved";
    await supabase
      .from("purchase_orders")
      .update({
        qty_received_total: totalReceived,
        receipt_progress_pct: pct,
        status: newStatus,
        ...(newStatus !== "received" ? { closed_at: null } : {}),
      })
      .eq("id", gr.source_doc_id);
  }

  // 6. 標記入庫單為 cancelled
  const { data: { user } } = await supabase.auth.getUser();
  const { error: voidErr } = await supabase
    .from("stock_receipts")
    .update({
      status: "cancelled",
      voided_at: new Date().toISOString(),
      voided_by: user?.id ?? null,
      void_reason: trimmed,
    })
    .eq("id", id);
  if (voidErr) return { ok: false, error: `標記作廢失敗:${voidErr.message}` };

  revalidatePath("/parts/purchase/orders");
  revalidatePath("/parts/receipt/po-grn");
  revalidatePath(`/parts/receipt/po-grn/${id}`);
  revalidatePath("/parts/operations/balance");
  revalidatePath("/parts/operations/receipts-history");
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// Pay supplier — 沖 PARTS_PURCHASE 產生的 AP
// ─────────────────────────────────────────────────────────────

export type PayReceiptInput = {
  receipt_id: string;
  bank_id?: string;        // 預設 'BANK-MAIN'
  amount?: number;         // 預設用 receipt.amount_total（含稅）
};

export async function payReceipt(
  input: PayReceiptInput,
): Promise<Result<{ receipt_id: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有結款的權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: gr, error: grErr } = await supabase
    .from("stock_receipts")
    .select(
      "id, gr_no, status, vendor_id, warehouse_id, amount_total, metadata, source_doc_type, source_doc_id",
    )
    .eq("id", input.receipt_id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (grErr) return { ok: false, error: grErr.message };
  if (!gr) return { ok: false, error: "找不到入庫單" };
  if (gr.status !== "completed" && gr.status !== "posted") {
    return { ok: false, error: `狀態 ${gr.status} 不可結款` };
  }
  if (!gr.vendor_id) return { ok: false, error: "此入庫單沒有供應商，無法結款" };
  const meta = (gr.metadata ?? {}) as Record<string, unknown>;
  const payment = (meta.payment ?? {}) as Record<string, unknown>;
  if (payment.status === "paid") {
    return { ok: false, error: "此入庫單已結款" };
  }

  // 取第一條 line 當代表（同 PARTS_PURCHASE 的 POC 假設：單 line GRN）
  const { data: firstLine, error: lineErr } = await supabase
    .from("stock_receipt_lines")
    .select("item_id")
    .eq("gr_id", gr.id)
    .order("line_no", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (lineErr) return { ok: false, error: lineErr.message };
  if (!firstLine) return { ok: false, error: "此入庫單無明細" };

  // store_id：從 warehouse 推（與 engine chain resolver 一致），補 ctx 也方便
  let storeId: string | null = null;
  if (gr.warehouse_id) {
    const { data: wh } = await supabase
      .from("warehouses")
      .select("org_id")
      .eq("id", gr.warehouse_id)
      .maybeSingle();
    storeId = wh?.org_id ?? null;
  }

  // 含稅金額；PARTS_PURCHASE 的 AP 是 net + tax，本筆付款一次清掉
  // input.amount 視為含稅；fallback 用 amount_total（未稅） × 1.05
  const amount =
    typeof input.amount === "number"
      ? Math.round(input.amount * 100) / 100
      : Math.round(Number(gr.amount_total ?? 0) * 1.05 * 100) / 100;
  const bankId = input.bank_id ?? "BANK-MAIN";
  const today = new Date().toISOString().slice(0, 10);

  const { data: { user } } = await supabase.auth.getUser();
  const nextMeta = {
    ...meta,
    payment: {
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_by: user?.id ?? null,
      bank_id: bankId,
      amount,
    },
  };
  const { error: updErr } = await supabase
    .from("stock_receipts")
    .update({ metadata: nextMeta })
    .eq("id", gr.id);
  if (updErr) return { ok: false, error: `標記付款失敗：${updErr.message}` };

  after(async () => {
    const res = await instantiateTransaction(
      TX_TYPES.VENDOR_PAYMENT_BANK,
      {
        supplier_id: gr.vendor_id,
        item_id: firstLine.item_id,
        warehouse_id: gr.warehouse_id,
        store_id: storeId,
        bank_id: bankId,
        amount,
      },
      { autoPost: true, entryDate: today, userId: user?.id },
    );
    if (!res.ok) {
      console.error("[accounting] VENDOR_PAYMENT_BANK 自動過帳失敗", {
        gr_no: gr.gr_no,
        error: res.error,
      });
    } else {
      console.log("[accounting] VENDOR_PAYMENT_BANK 已自動過帳（posted）", {
        gr_no: gr.gr_no,
        journal_entry: res.data,
      });
    }
  });

  revalidatePath("/parts/receipt/po-grn");
  revalidatePath(`/parts/receipt/po-grn/${gr.id}`);
  return { ok: true, data: { receipt_id: gr.id } };
}

// ─────────────────────────────────────────────────────────────
//  退回供應商：標 metadata.return + after() 非阻塞觸發 PARTS_RETURN_TO_SUPPLIER
//  POC v1：未結款才能退；不動 stock_items（業務面 v2 再做）
// ─────────────────────────────────────────────────────────────

export type ReturnReceiptInput = {
  receipt_id: string;
  reason?: string;
  net_amount?: number;       // 預設 receipt.amount_total
  tax_amount?: number;       // 預設 net × 0.05
};

export async function returnReceipt(
  input: ReturnReceiptInput,
): Promise<Result<{ receipt_id: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有退貨的權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: gr, error: grErr } = await supabase
    .from("stock_receipts")
    .select(
      "id, gr_no, status, vendor_id, warehouse_id, amount_total, metadata, source_doc_type, source_doc_id",
    )
    .eq("id", input.receipt_id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (grErr) return { ok: false, error: grErr.message };
  if (!gr) return { ok: false, error: "找不到入庫單" };
  if (gr.status !== "completed" && gr.status !== "posted") {
    return { ok: false, error: `狀態 ${gr.status} 不可退貨` };
  }
  if (!gr.vendor_id) return { ok: false, error: "此入庫單沒有供應商，無法退貨" };
  const meta = (gr.metadata ?? {}) as Record<string, unknown>;
  const payment = (meta.payment ?? {}) as Record<string, unknown>;
  if (payment.status === "paid") {
    return { ok: false, error: "已結款的入庫單不可直接退貨（請走退款流程）" };
  }
  const returnMeta = (meta.return ?? {}) as Record<string, unknown>;
  if (returnMeta.status === "returned") {
    return { ok: false, error: "此入庫單已退回供應商" };
  }

  const { data: firstLine, error: lineErr } = await supabase
    .from("stock_receipt_lines")
    .select("item_id")
    .eq("gr_id", gr.id)
    .order("line_no", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (lineErr) return { ok: false, error: lineErr.message };
  if (!firstLine) return { ok: false, error: "此入庫單無明細" };

  let storeId: string | null = null;
  if (gr.warehouse_id) {
    const { data: wh } = await supabase
      .from("warehouses")
      .select("org_id")
      .eq("id", gr.warehouse_id)
      .maybeSingle();
    storeId = wh?.org_id ?? null;
  }

  // net / tax：跟 PARTS_PURCHASE 對稱，amount_total 是未稅
  const netAmount =
    typeof input.net_amount === "number"
      ? Math.round(input.net_amount * 100) / 100
      : Math.round(Number(gr.amount_total ?? 0) * 100) / 100;
  const taxAmount =
    typeof input.tax_amount === "number"
      ? Math.round(input.tax_amount * 100) / 100
      : Math.round(netAmount * 0.05 * 100) / 100;
  const today = new Date().toISOString().slice(0, 10);

  const { data: { user } } = await supabase.auth.getUser();
  const nextMeta = {
    ...meta,
    return: {
      status: "returned",
      returned_at: new Date().toISOString(),
      returned_by: user?.id ?? null,
      reason: input.reason?.trim() ?? null,
      net_amount: netAmount,
      tax_amount: taxAmount,
    },
  };
  const { error: updErr } = await supabase
    .from("stock_receipts")
    .update({ metadata: nextMeta })
    .eq("id", gr.id);
  if (updErr) return { ok: false, error: `標記退貨失敗：${updErr.message}` };

  after(async () => {
    const res = await instantiateTransaction(
      TX_TYPES.PARTS_RETURN_TO_SUPPLIER,
      {
        supplier_id: gr.vendor_id,
        item_id: firstLine.item_id,
        warehouse_id: gr.warehouse_id,
        store_id: storeId,
        net_amount: netAmount,
        tax_amount: taxAmount,
      },
      { autoPost: true, entryDate: today, userId: user?.id },
    );
    if (!res.ok) {
      console.error("[accounting] PARTS_RETURN_TO_SUPPLIER 自動過帳失敗", {
        gr_no: gr.gr_no,
        error: res.error,
      });
    } else {
      console.log("[accounting] PARTS_RETURN_TO_SUPPLIER 已自動過帳（posted）", {
        gr_no: gr.gr_no,
        journal_entry: res.data,
      });
    }
  });

  revalidatePath("/parts/receipt/po-grn");
  revalidatePath(`/parts/receipt/po-grn/${gr.id}`);
  return { ok: true, data: { receipt_id: gr.id } };
}

// ─────────────────────────── PO GRN new page（/parts/receipt/po-grn/new） ───────────────────────────

export interface PoCandidate {
  id: string;
  po_no: string;
  status: string;
  vendor_name: string | null;
  warehouse_name: string | null;
  qty_ordered_total: number;
  qty_received_total: number;
}

export interface PoGrnDetail {
  po: {
    id: string;
    po_no: string;
    warehouse_id: string;
    vendor_name: string | null;
    warehouse_name: string | null;
  };
  lines: Array<{
    id: string;
    line_no: number;
    item_id: string;
    qty_ordered: number;
    qty_received: number;
    unit_price: number;
    item_code: string;
    item_name: string;
  }>;
  bins: Array<{ id: string; code: string; name: string | null }>;
}

export type PoGrnNewPageData =
  | { mode: "chooser"; candidates: PoCandidate[] }
  | { mode: "detail"; detail: PoGrnDetail }
  | { mode: "detail"; detail: null };

export async function getPoGrnNewPageData(poId?: string): Promise<PoGrnNewPageData> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  if (!poId) {
    const { data, error } = await supabase
      .from("purchase_orders")
      .select(
        "id, po_no, status, vendor_id, warehouse_id, qty_ordered_total, qty_received_total, suppliers ( name ), warehouses ( name )",
      )
      .eq("brand_id", brand)
      .in("status", ["approved", "partial_received"])
      .order("po_date", { ascending: false })
      .limit(50);
    if (error) throw new Error(`po candidates: ${error.message}`);
    const candidates = ((data ?? []) as unknown as Array<{
      id: string;
      po_no: string;
      status: string;
      qty_ordered_total: number;
      qty_received_total: number;
      suppliers: { name: string | null } | null;
      warehouses: { name: string | null } | null;
    }>).map((r) => ({
      id: r.id,
      po_no: r.po_no,
      status: r.status,
      qty_ordered_total: Number(r.qty_ordered_total ?? 0),
      qty_received_total: Number(r.qty_received_total ?? 0),
      vendor_name: r.suppliers?.name ?? null,
      warehouse_name: r.warehouses?.name ?? null,
    }));
    return { mode: "chooser", candidates };
  }

  // poId 模式：撈單張 PO 的細節 + bins
  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_no, status, vendor_id, warehouse_id, suppliers ( name ), warehouses ( name )",
    )
    .eq("brand_id", brand)
    .eq("id", poId)
    .single();
  if (poErr || !po) return { mode: "detail", detail: null };

  const [linesRes, binsRes] = await Promise.all([
    supabase
      .from("purchase_order_lines")
      .select(
        "id, line_no, item_id, qty_ordered, qty_received, unit_price, items ( code, name )",
      )
      .eq("brand_id", brand)
      .eq("po_id", poId)
      .order("line_no"),
    supabase
      .from("warehouse_bins")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq(
        "warehouse_id",
        (po as unknown as { warehouse_id: string }).warehouse_id,
      )
      .order("code"),
  ]);
  if (linesRes.error) throw new Error(`lines: ${linesRes.error.message}`);

  const lines = (linesRes.data ?? []).map((l) => {
    const meta = l as unknown as {
      id: string;
      line_no: number;
      item_id: string;
      qty_ordered: number;
      qty_received: number;
      unit_price: number;
      items: { code: string | null; name: string | null } | null;
    };
    return {
      id: meta.id,
      line_no: meta.line_no,
      item_id: meta.item_id,
      qty_ordered: Number(meta.qty_ordered),
      qty_received: Number(meta.qty_received),
      unit_price: Number(meta.unit_price),
      item_code: meta.items?.code ?? "",
      item_name: meta.items?.name ?? "",
    };
  });

  const headerRow = po as unknown as {
    id: string;
    po_no: string;
    warehouse_id: string;
    suppliers: { name: string | null } | null;
    warehouses: { name: string | null } | null;
  };

  return {
    mode: "detail",
    detail: {
      po: {
        id: headerRow.id,
        po_no: headerRow.po_no,
        warehouse_id: headerRow.warehouse_id,
        vendor_name: headerRow.suppliers?.name ?? null,
        warehouse_name: headerRow.warehouses?.name ?? null,
      },
      lines,
      bins: (binsRes.data ?? []) as Array<{ id: string; code: string; name: string | null }>,
    },
  };
}

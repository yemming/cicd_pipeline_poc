"use server";

/**
 * Domain Helper — Stock Receipts（入庫單）
 *
 * Read：listReceipts / getReceiptsPageData
 * Mutations：receiveStock（從 src/lib/parts/actions/index.ts 遷入；Result<T> 沿用 domain 慣例）
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

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

export async function listReceipts(filter: {
  type?: string;
  status?: string;
  q?: string;
} = {}): Promise<StockReceiptListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("stock_receipts")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("receipt_date", { ascending: false })
    .limit(200);
  if (filter.type) q = q.eq("type", filter.type);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.q) q = q.ilike("gr_no", `%${filter.q}%`);

  const { data: rs, error } = await q;
  if (error) throw error;
  if (!rs || rs.length === 0) return [];

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

  return rs.map((r) => ({
    ...r,
    vendor_name: r.vendor_id ? vMap.get(r.vendor_id) ?? null : null,
    warehouse_name: r.warehouse_id ? wMap.get(r.warehouse_id) ?? null : null,
  }));
}

export async function getReceiptsPageData(filter: {
  type?: string;
  status?: string;
  q?: string;
} = {}): Promise<{
  rows: StockReceiptListRow[];
  canEdit: boolean;
}> {
  const [rows, canEdit] = await Promise.all([
    listReceipts(filter),
    hasPermission(PERMISSIONS.RECEIPT_CREATE),
  ]);
  return { rows, canEdit };
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
  const inputLineByPoLineId = new Map(input.lines.map((l) => [l.po_line_id, l]));
  const stockItems = grLines.map((grLine, idx) => {
    const inputLine = input.lines[idx];
    return {
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

  revalidatePath("/parts/purchase/orders");
  revalidatePath("/parts/receipt/po-grn");
  revalidatePath("/parts/operations/balance");
  revalidatePath("/parts/operations/receipts-history");
  return { ok: true, data: { receipt_id: gr.id, gr_no } };
}

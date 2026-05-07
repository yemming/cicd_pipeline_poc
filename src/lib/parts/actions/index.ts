/**
 * Parts 模組 server actions — 寫入操作（CRUD）。
 *
 * 規則（CRITICAL）：
 *   - 一律 `'use server'` + `createClient`(吃 RLS)— 禁用 createServiceClient
 *   - 所有寫入動作必須回傳 `{ ok: true, ... } | { ok: false, error: string }`
 *   - 寫 stock_items 時必須記 source_receipt_line_id / source_transfer_line_id 讓 audit trail 追得回原單據
 */

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ItemInsert } from "../types";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const TAX_RATE = 0.05;

// ──────────────────────────────────────────────────────────
// 主檔 CRUD
// ──────────────────────────────────────────────────────────

export async function createItem(
  input: ItemInsert,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .insert(input)
    .select("id")
    .single();
  if (error) return { ok: false, error: `createItem: ${error.message}` };
  return { ok: true, data: { id: data.id } };
}

// ──────────────────────────────────────────────────────────
// 採購流程
// ──────────────────────────────────────────────────────────

export type CreatePurchaseOrderInput = {
  vendor_id: string;
  warehouse_id: string;
  purchase_type?: string;
  notes?: string;
  eta_date?: string;
  lines: Array<{
    item_id: string;
    qty_ordered: number;
    unit_price: number;
    uom?: string;
  }>;
};

/** 建立 PO(pending 狀態)+ lines + 自動產號 */
export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
): Promise<ActionResult<{ id: string; po_no: string }>> {
  if (!input.vendor_id || !input.warehouse_id) {
    return { ok: false, error: "供應商與倉庫必填" };
  }
  if (!input.lines?.length) {
    return { ok: false, error: "至少需要一筆採購明細" };
  }
  for (const line of input.lines) {
    if (!line.item_id) return { ok: false, error: "明細缺料件" };
    if (!(line.qty_ordered > 0)) return { ok: false, error: "明細數量需 > 0" };
    if (!(line.unit_price >= 0)) return { ok: false, error: "明細單價不可為負" };
  }

  const supabase = await createClient();

  // 1. 產 PO 號 PO + yyyymmdd-NNN
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const { data: lastPO } = await supabase
    .from("purchase_orders")
    .select("po_no")
    .like("po_no", `PO${dateStr}-%`)
    .order("po_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (lastPO?.po_no) {
    const m = lastPO.po_no.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  const po_no = `PO${dateStr}-${String(seq).padStart(3, "0")}`;

  // 2. 計算金額(每行 pretax + 5% tax)
  const linesWithAmount = input.lines.map((l, idx) => {
    const pretax = Math.round(l.qty_ordered * l.unit_price * 100) / 100;
    const tax = Math.round(pretax * TAX_RATE * 100) / 100;
    const total = Math.round((pretax + tax) * 100) / 100;
    return {
      line_no: idx + 1,
      item_id: l.item_id,
      qty_ordered: l.qty_ordered,
      unit_price: l.unit_price,
      uom: l.uom ?? "PCS",
      tax_rate: TAX_RATE,
      line_amount_pretax: pretax,
      line_amount_tax: tax,
      line_amount_total: total,
    };
  });
  const subtotal = linesWithAmount.reduce((s, l) => s + l.line_amount_pretax, 0);
  const tax = linesWithAmount.reduce((s, l) => s + l.line_amount_tax, 0);
  const total = subtotal + tax;
  const qty_total = input.lines.reduce((s, l) => s + l.qty_ordered, 0);

  // 3. Insert PO
  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .insert({
      po_no,
      vendor_id: input.vendor_id,
      warehouse_id: input.warehouse_id,
      purchase_type: input.purchase_type ?? "ad_hoc",
      notes: input.notes ?? null,
      eta_date: input.eta_date ?? null,
      po_date: today.toISOString().slice(0, 10),
      qty_ordered_total: qty_total,
      amount_pretax: subtotal,
      amount_tax: tax,
      amount_total: total,
      status: "pending",
    })
    .select("id")
    .single();
  if (poErr) return { ok: false, error: `建立 PO 失敗:${poErr.message}` };

  // 4. Insert lines
  const linesToInsert = linesWithAmount.map((l) => ({ ...l, po_id: po.id }));
  const { error: linesErr } = await supabase
    .from("purchase_order_lines")
    .insert(linesToInsert);
  if (linesErr) {
    await supabase.from("purchase_orders").delete().eq("id", po.id);
    return { ok: false, error: `建立明細失敗:${linesErr.message}` };
  }

  revalidatePath("/parts/purchase/orders");
  revalidatePath("/parts/receipt/po-grn");
  return { ok: true, data: { id: po.id, po_no } };
}

/** PO 審核：pending → approved */
export async function approvePurchaseOrder(
  poId: string,
): Promise<ActionResult> {
  if (!poId) return { ok: false, error: "缺 poId" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("purchase_orders")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user?.id ?? null,
    })
    .eq("id", poId)
    .eq("status", "pending");
  if (error) return { ok: false, error: `審核失敗:${error.message}` };
  revalidatePath("/parts/purchase/orders");
  revalidatePath("/parts/receipt/po-grn");
  return { ok: true, data: null };
}

/** PO 取消:任何狀態 → cancelled(只有未入庫才能取消) */
export async function cancelPurchaseOrder(
  poId: string,
): Promise<ActionResult> {
  if (!poId) return { ok: false, error: "缺 poId" };
  const supabase = await createClient();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("qty_received_total")
    .eq("id", poId)
    .single();
  if (po && po.qty_received_total > 0) {
    return { ok: false, error: "已部分入庫,無法取消" };
  }
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "cancelled" })
    .eq("id", poId);
  if (error) return { ok: false, error: `取消失敗:${error.message}` };
  revalidatePath("/parts/purchase/orders");
  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────
// 入庫流程(GR)
// ──────────────────────────────────────────────────────────

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
): Promise<ActionResult<{ receipt_id: string; gr_no: string }>> {
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
      type: "po_grn",
      warehouse_id: po.warehouse_id,
      vendor_id: po.vendor_id,
      receipt_date: input.receipt_date ?? today.toISOString().slice(0, 10),
      notes: input.notes ?? null,
      qty_received_total: totalQty,
      amount_total: totalAmount,
      source_doc_id: po.id,
      source_doc_type: "purchase_order",
      status: "posted",
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

// ──────────────────────────────────────────────────────────
// W2-W6 stub(後續 sprint 實作)
// ──────────────────────────────────────────────────────────

export async function issueForRepair(): Promise<ActionResult> {
  return { ok: false, error: "issueForRepair: 待 W2 實作" };
}

export async function issueForInternalSale(): Promise<ActionResult> {
  return { ok: false, error: "issueForInternalSale: 待 W2 實作" };
}

export async function createTransfer(): Promise<ActionResult> {
  return { ok: false, error: "createTransfer: 待 W3 實作" };
}

export async function receiveTransfer(): Promise<ActionResult> {
  return { ok: false, error: "receiveTransfer: 待 W3 實作" };
}

export async function submitCountSession(): Promise<ActionResult> {
  return { ok: false, error: "submitCountSession: 待 W3 實作" };
}

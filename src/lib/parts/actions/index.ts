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
import { getBrandKey } from "@/lib/brands/current";
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

// ──────────────────────────────────────────────────────────
// W2 出庫 — RO 工單一鍵領料
// ──────────────────────────────────────────────────────────

export type IssueForRepairInput = {
  work_order_id: string;
  warehouse_id: string;
  notes?: string;
};

/**
 * RO 工單一鍵領料：把 work_order_items 中 kind='parts' 的料件從庫存扣帳，
 * 建立 stock_issues 單（type='ro_picking'）+ lines，並把 stock_items qty 扣減。
 *
 * 規則：
 *  - 同 brand_id 過濾（getBrandKey）
 *  - 庫存依 created_at FIFO 配置
 *  - 任一料件庫存不足則整批 abort（不部分扣帳）
 *  - 預檢通過後才寫入；失敗 rollback 主檔
 *  - 預設一張 RO 一張領料單；重複呼叫不擋（業務上可能補領）
 */
export async function issueForRepair(
  input: IssueForRepairInput,
): Promise<ActionResult<{ issue_id: string; gi_no: string }>> {
  if (!input?.work_order_id) return { ok: false, error: "缺 work_order_id" };
  if (!input?.warehouse_id) return { ok: false, error: "缺 warehouse_id" };

  const supabase = await createClient();
  const brandId = getBrandKey();

  // 1. 撈 work order
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, ro_no, brand_id, customer_id, status")
    .eq("id", input.work_order_id)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (woErr || !wo) return { ok: false, error: `找不到工單：${woErr?.message ?? "no row"}` };
  if (!["draft", "dispatched", "in_progress", "qc"].includes(wo.status)) {
    return { ok: false, error: `工單狀態 ${wo.status} 不可領料（需 draft/dispatched/in_progress/qc）` };
  }

  // 2. 撈 work_order_items kind='parts' 且 item_id NOT NULL
  const { data: woItems, error: woItemsErr } = await supabase
    .from("work_order_items")
    .select("id, item_id, qty, description")
    .eq("work_order_id", wo.id)
    .eq("kind", "parts")
    .not("item_id", "is", null);
  if (woItemsErr) return { ok: false, error: `撈工單明細失敗：${woItemsErr.message}` };
  if (!woItems || woItems.length === 0) {
    return { ok: false, error: "此工單沒有料件項目（kind='parts' 且綁定 item_id）" };
  }

  // 3. 對每個 parts item 撈可用庫存（FIFO），預先計算配置
  type Allocation = {
    line_no: number;
    item_id: string;
    qty_needed: number;
    description: string;
    picks: Array<{ stock_id: string; bin_id: string | null; qty: number; unit_cost: number; serial_no: string | null; batch_no: string | null }>;
  };
  const allocations: Allocation[] = [];
  for (let i = 0; i < woItems.length; i++) {
    const it = woItems[i];
    const qtyNeeded = Number(it.qty);
    if (!Number.isFinite(qtyNeeded) || qtyNeeded <= 0) continue;

    const { data: stocks, error: stockErr } = await supabase
      .from("stock_items")
      .select("id, qty, bin_id, unit_cost, serial_no, batch_no, created_at")
      .eq("brand_id", brandId)
      .eq("warehouse_id", input.warehouse_id)
      .eq("item_id", it.item_id!)
      .eq("status", "available")
      .gt("qty", 0)
      .order("created_at", { ascending: true });
    if (stockErr) return { ok: false, error: `撈庫存失敗：${stockErr.message}` };

    let remaining = qtyNeeded;
    const picks: Allocation["picks"] = [];
    for (const s of stocks ?? []) {
      if (remaining <= 0) break;
      const take = Math.min(Number(s.qty), remaining);
      picks.push({
        stock_id: s.id,
        bin_id: s.bin_id,
        qty: take,
        unit_cost: Number(s.unit_cost ?? 0),
        serial_no: s.serial_no,
        batch_no: s.batch_no,
      });
      remaining -= take;
    }
    if (remaining > 0) {
      return {
        ok: false,
        error: `料件「${it.description}」庫存不足（缺 ${remaining}）`,
      };
    }
    allocations.push({
      line_no: i + 1,
      item_id: it.item_id!,
      qty_needed: qtyNeeded,
      description: it.description,
      picks,
    });
  }

  if (allocations.length === 0) {
    return { ok: false, error: "工單沒有需要領料的項目（qty>0 且綁定 item_id）" };
  }

  // 4. 產 gi_no = ISS{YYYYMMDD}-{NNN}
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const { data: lastIss } = await supabase
    .from("stock_issues")
    .select("gi_no")
    .eq("brand_id", brandId)
    .like("gi_no", `ISS${dateStr}-%`)
    .order("gi_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (lastIss?.gi_no) {
    const m = lastIss.gi_no.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  const gi_no = `ISS${dateStr}-${String(seq).padStart(3, "0")}`;

  // 5. 計算 totals
  const qtyTotal = allocations.reduce((s, a) => s + a.qty_needed, 0);
  const amountTotal = allocations.reduce((s, a) => {
    return s + a.picks.reduce((ss, p) => ss + p.qty * p.unit_cost, 0);
  }, 0);

  // 6. Insert stock_issues 主檔
  const { data: issue, error: issueErr } = await supabase
    .from("stock_issues")
    .insert({
      brand_id: brandId,
      gi_no,
      type: "ro_picking",
      source_doc_type: "work_order",
      source_doc_id: wo.id,
      ro_id: wo.id,
      customer_id: wo.customer_id,
      warehouse_id: input.warehouse_id,
      issue_date: today.toISOString().slice(0, 10),
      status: "completed",
      qty_issued_total: qtyTotal,
      amount_total: Math.round(amountTotal * 100) / 100,
      notes: input.notes ?? `RO ${wo.ro_no} 一鍵領料`,
      posted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (issueErr) return { ok: false, error: `建立領料單失敗：${issueErr.message}` };

  // 7. Insert stock_issue_lines（每個 allocation 對每個 pick 一行）
  const linesToInsert: Array<Record<string, unknown>> = [];
  let lineCounter = 1;
  for (const alloc of allocations) {
    for (const pick of alloc.picks) {
      const lineAmount = Math.round(pick.qty * pick.unit_cost * 100) / 100;
      linesToInsert.push({
        brand_id: brandId,
        gi_id: issue.id,
        line_no: lineCounter++,
        item_id: alloc.item_id,
        bin_id: pick.bin_id,
        qty_issued: pick.qty,
        uom: "個",
        unit_cost: pick.unit_cost,
        unit_price: pick.unit_cost,
        line_amount: lineAmount,
        serial_no: pick.serial_no,
        batch_no: pick.batch_no,
      });
    }
  }
  const { error: linesErr } = await supabase
    .from("stock_issue_lines")
    .insert(linesToInsert);
  if (linesErr) {
    await supabase.from("stock_issues").delete().eq("id", issue.id);
    return { ok: false, error: `建立領料明細失敗：${linesErr.message}` };
  }

  // 8. 扣 stock_items qty
  for (const alloc of allocations) {
    for (const pick of alloc.picks) {
      const { data: cur } = await supabase
        .from("stock_items")
        .select("qty")
        .eq("id", pick.stock_id)
        .single();
      const newQty = Number(cur?.qty ?? 0) - pick.qty;
      const update: Record<string, unknown> = {
        qty: Math.max(0, Math.round(newQty * 100) / 100),
        last_movement_at: new Date().toISOString(),
      };
      if (newQty <= 0) update.status = "issued";
      await supabase.from("stock_items").update(update).eq("id", pick.stock_id);
    }
  }

  revalidatePath("/parts/issue/repair-pick");
  revalidatePath("/parts/operations/balance");
  revalidatePath(`/admin/master-data/work-orders/${wo.id}`);
  return { ok: true, data: { issue_id: issue.id, gi_no } };
}

/**
 * 取消領料單：把 stock_issue 標 cancelled，並建新的 available stock_items 行還原庫存。
 * （source attribution 簡化：不還回原 row，建新 row）
 */
export async function cancelIssue(
  issueId: string,
): Promise<ActionResult<{ issue_id: string }>> {
  if (!issueId) return { ok: false, error: "缺 issueId" };

  const supabase = await createClient();
  const brandId = getBrandKey();

  const { data: issue, error: issueErr } = await supabase
    .from("stock_issues")
    .select("id, gi_no, status, warehouse_id, brand_id")
    .eq("id", issueId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (issueErr || !issue) return { ok: false, error: `找不到領料單：${issueErr?.message ?? "no row"}` };
  if (issue.status === "cancelled") {
    return { ok: false, error: "此領料單已取消" };
  }

  const { data: lines, error: linesErr } = await supabase
    .from("stock_issue_lines")
    .select("id, item_id, bin_id, qty_issued, unit_cost, serial_no, batch_no")
    .eq("gi_id", issueId);
  if (linesErr) return { ok: false, error: `撈領料明細失敗：${linesErr.message}` };

  // 建新的 available stock_items 還原
  if (lines && lines.length > 0) {
    const newStocks = lines.map((l) => ({
      brand_id: brandId,
      item_id: l.item_id,
      warehouse_id: issue.warehouse_id,
      bin_id: l.bin_id,
      qty: l.qty_issued,
      unit_cost: l.unit_cost ?? 0,
      status: "available",
      serial_no: l.serial_no,
      batch_no: l.batch_no,
      notes: `領料單 ${issue.gi_no} 取消還原`,
    }));
    const { error: insertErr } = await supabase
      .from("stock_items")
      .insert(newStocks);
    if (insertErr) return { ok: false, error: `還原庫存失敗：${insertErr.message}` };
  }

  await supabase
    .from("stock_issues")
    .update({ status: "cancelled" })
    .eq("id", issueId);

  revalidatePath("/parts/issue/repair-pick");
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { issue_id: issueId } };
}

// ──────────────────────────────────────────────────────────
// W3 調撥 — A 倉開單出庫 → 在途 → B 倉收貨入庫
// ──────────────────────────────────────────────────────────

export type CreateTransferInput = {
  source_warehouse_id: string;
  target_warehouse_id: string;
  transfer_type?: string;
  reason?: string;
  notes?: string;
  expected_arrival_date?: string;
  logistics_provider?: string;
  logistics_tracking_no?: string;
  lines: Array<{
    item_id: string;
    qty_requested: number;
    source_bin_id?: string;
    target_bin_id?: string;
  }>;
};

const TRANSFER_TYPES = ["inter_store", "intra_store", "warranty_to_temp", "consignment_to_main"] as const;

/**
 * 建立並出庫調撥單：source 倉扣 stock_items.qty，建相同數量的 in_transit 行掛 target 倉。
 * status='in_transit' / shipped_at=now / shipped_by=user。
 */
export async function createAndShipTransfer(
  input: CreateTransferInput,
): Promise<ActionResult<{ transfer_id: string; tr_no: string }>> {
  if (!input?.source_warehouse_id) return { ok: false, error: "缺 source_warehouse_id" };
  if (!input?.target_warehouse_id) return { ok: false, error: "缺 target_warehouse_id" };
  if (input.source_warehouse_id === input.target_warehouse_id) {
    return { ok: false, error: "來源倉與目的倉不可相同" };
  }
  if (!input.lines?.length) return { ok: false, error: "至少需要一筆調撥明細" };
  for (const l of input.lines) {
    if (!l.item_id) return { ok: false, error: "明細缺料件" };
    if (!(l.qty_requested > 0)) return { ok: false, error: "明細數量需 > 0" };
  }
  const transferType = input.transfer_type ?? "inter_store";
  if (!(TRANSFER_TYPES as readonly string[]).includes(transferType)) {
    return { ok: false, error: `不支援的 transfer_type: ${transferType}` };
  }

  const supabase = await createClient();
  const brandId = getBrandKey();

  // 1. 預檢配置：對每個 line 撈來源倉庫存（FIFO），算配置
  type Allocation = {
    line_no: number;
    item_id: string;
    qty_requested: number;
    target_bin_id: string | null;
    picks: Array<{ stock_id: string; bin_id: string | null; qty: number; unit_cost: number; serial_no: string | null; batch_no: string | null }>;
  };
  const allocations: Allocation[] = [];
  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    const { data: stocks, error: stockErr } = await supabase
      .from("stock_items")
      .select("id, qty, bin_id, unit_cost, serial_no, batch_no, created_at")
      .eq("brand_id", brandId)
      .eq("warehouse_id", input.source_warehouse_id)
      .eq("item_id", line.item_id)
      .eq("status", "available")
      .gt("qty", 0)
      .order("created_at", { ascending: true });
    if (stockErr) return { ok: false, error: `撈來源庫存失敗：${stockErr.message}` };

    let remaining = line.qty_requested;
    const picks: Allocation["picks"] = [];
    for (const s of stocks ?? []) {
      if (remaining <= 0) break;
      if (line.source_bin_id && s.bin_id !== line.source_bin_id) continue;
      const take = Math.min(Number(s.qty), remaining);
      picks.push({
        stock_id: s.id,
        bin_id: s.bin_id,
        qty: take,
        unit_cost: Number(s.unit_cost ?? 0),
        serial_no: s.serial_no,
        batch_no: s.batch_no,
      });
      remaining -= take;
    }
    if (remaining > 0) {
      return { ok: false, error: `料件 ${line.item_id.slice(0, 8)} 來源倉庫存不足（缺 ${remaining}）` };
    }
    allocations.push({
      line_no: i + 1,
      item_id: line.item_id,
      qty_requested: line.qty_requested,
      target_bin_id: line.target_bin_id ?? null,
      picks,
    });
  }

  // 2. 產 tr_no=TR{YYYYMMDD}-{NNN}
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const { data: lastTr } = await supabase
    .from("stock_transfers")
    .select("tr_no")
    .eq("brand_id", brandId)
    .like("tr_no", `TR${dateStr}-%`)
    .order("tr_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (lastTr?.tr_no) {
    const m = lastTr.tr_no.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  const tr_no = `TR${dateStr}-${String(seq).padStart(3, "0")}`;

  // 3. 計算 totals
  const qtyTotal = allocations.reduce((s, a) => s + a.qty_requested, 0);

  // 4. Insert stock_transfers 主檔
  const { data: tr, error: trErr } = await supabase
    .from("stock_transfers")
    .insert({
      brand_id: brandId,
      tr_no,
      source_warehouse_id: input.source_warehouse_id,
      target_warehouse_id: input.target_warehouse_id,
      transfer_type: transferType,
      reason: input.reason ?? null,
      status: "in_transit",
      ship_date: today.toISOString().slice(0, 10),
      expected_arrival_date: input.expected_arrival_date ?? null,
      qty_requested_total: qtyTotal,
      qty_shipped_total: qtyTotal,
      qty_received_total: 0,
      logistics_provider: input.logistics_provider ?? null,
      logistics_tracking_no: input.logistics_tracking_no ?? null,
      notes: input.notes ?? null,
      shipped_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (trErr) return { ok: false, error: `建立調撥單失敗：${trErr.message}` };

  // 5. Insert lines
  const linesToInsert = allocations.map((a) => {
    const totalCost = a.picks.reduce((s, p) => s + p.qty * p.unit_cost, 0);
    const avgCost = a.qty_requested > 0 ? totalCost / a.qty_requested : 0;
    return {
      brand_id: brandId,
      tr_id: tr.id,
      line_no: a.line_no,
      item_id: a.item_id,
      source_bin_id: a.picks[0]?.bin_id ?? null,
      target_bin_id: a.target_bin_id,
      qty_requested: a.qty_requested,
      qty_shipped: a.qty_requested,
      qty_received: 0,
      uom: "個",
      unit_cost: avgCost,
    };
  });
  const { data: trLines, error: linesErr } = await supabase
    .from("stock_transfer_lines")
    .insert(linesToInsert)
    .select("id, item_id, qty_requested, unit_cost, target_bin_id");
  if (linesErr || !trLines) {
    await supabase.from("stock_transfers").delete().eq("id", tr.id);
    return { ok: false, error: `建立調撥明細失敗：${linesErr?.message ?? ""}` };
  }

  // 6. 扣 source stock_items.qty + 建 in_transit 新行（掛 target_warehouse）
  const trLineByItem = new Map(trLines.map((l) => [l.item_id, l]));
  for (const alloc of allocations) {
    // 扣源
    for (const pick of alloc.picks) {
      const { data: cur } = await supabase
        .from("stock_items")
        .select("qty")
        .eq("id", pick.stock_id)
        .single();
      const newQty = Number(cur?.qty ?? 0) - pick.qty;
      const update: Record<string, unknown> = {
        qty: Math.max(0, Math.round(newQty * 100) / 100),
        last_movement_at: new Date().toISOString(),
      };
      if (newQty <= 0) update.status = "issued";
      await supabase.from("stock_items").update(update).eq("id", pick.stock_id);
    }
    // 建 in_transit（依然依 picks 一行一行建，保持 unit_cost / serial / batch 細粒度）
    const trLine = trLineByItem.get(alloc.item_id);
    const inTransitRows = alloc.picks.map((p) => ({
      brand_id: brandId,
      item_id: alloc.item_id,
      warehouse_id: input.target_warehouse_id,
      bin_id: alloc.target_bin_id,
      qty: p.qty,
      status: "in_transit",
      unit_cost: p.unit_cost,
      serial_no: p.serial_no,
      batch_no: p.batch_no,
      source_transfer_line_id: trLine?.id ?? null,
      notes: `調撥 ${tr_no} 在途`,
    }));
    const { error: itrErr } = await supabase.from("stock_items").insert(inTransitRows);
    if (itrErr) {
      return { ok: false, error: `建在途庫存失敗：${itrErr.message}` };
    }
  }

  revalidatePath("/parts/issue/transfer-out");
  revalidatePath("/parts/receipt/transfer-in");
  revalidatePath("/parts/operations/transfers-in-transit");
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { transfer_id: tr.id, tr_no } };
}

/**
 * 收貨入庫：把該調撥單對應的 stock_items（status='in_transit', source_transfer_line_id 對應）
 * 翻成 'available'。同時建 stock_receipts 紀錄；更新 stock_transfers.status='received'。
 */
export async function receiveTransferAction(
  transferId: string,
): Promise<ActionResult<{ transfer_id: string; gr_no: string }>> {
  if (!transferId) return { ok: false, error: "缺 transferId" };

  const supabase = await createClient();
  const brandId = getBrandKey();

  // 1. 撈調撥單 + lines
  const { data: tr, error: trErr } = await supabase
    .from("stock_transfers")
    .select("id, tr_no, status, source_warehouse_id, target_warehouse_id, qty_shipped_total")
    .eq("id", transferId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (trErr || !tr) return { ok: false, error: `找不到調撥單：${trErr?.message ?? "no row"}` };
  if (tr.status === "received" || tr.status === "closed") {
    return { ok: false, error: "此調撥單已收貨" };
  }
  if (tr.status !== "in_transit") {
    return { ok: false, error: `狀態 ${tr.status} 不可收貨（需 in_transit）` };
  }

  const { data: trLines, error: linesErr } = await supabase
    .from("stock_transfer_lines")
    .select("id, item_id, qty_shipped, target_bin_id, unit_cost")
    .eq("tr_id", transferId);
  if (linesErr || !trLines) return { ok: false, error: `撈調撥明細失敗：${linesErr?.message ?? ""}` };

  // 2. 翻 in_transit → available（依 source_transfer_line_id 過濾）
  const lineIds = trLines.map((l) => l.id);
  const { data: inTransitRows } = await supabase
    .from("stock_items")
    .select("id, qty")
    .eq("brand_id", brandId)
    .in("source_transfer_line_id", lineIds)
    .eq("status", "in_transit");

  const totalReceived = (inTransitRows ?? []).reduce((s, r) => s + Number(r.qty), 0);

  for (const r of inTransitRows ?? []) {
    await supabase
      .from("stock_items")
      .update({
        status: "available",
        last_movement_at: new Date().toISOString(),
      })
      .eq("id", r.id);
  }

  // 3. 產 GR 號 GR{YYYYMMDD}-{NNN}（type='transfer_in'）
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const { data: lastGr } = await supabase
    .from("stock_receipts")
    .select("gr_no")
    .eq("brand_id", brandId)
    .like("gr_no", `GR${dateStr}-%`)
    .order("gr_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (lastGr?.gr_no) {
    const m = lastGr.gr_no.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  const gr_no = `GR${dateStr}-${String(seq).padStart(3, "0")}`;

  // 4. 建 stock_receipts (type='transfer_in', source=stock_transfer)
  const totalAmount = trLines.reduce(
    (s, l) => s + Number(l.qty_shipped) * Number(l.unit_cost ?? 0),
    0,
  );
  const { error: grErr } = await supabase.from("stock_receipts").insert({
    brand_id: brandId,
    gr_no,
    type: "transfer",
    warehouse_id: tr.target_warehouse_id,
    receipt_date: today.toISOString().slice(0, 10),
    qty_received_total: totalReceived,
    amount_total: Math.round(totalAmount * 100) / 100,
    source_doc_id: tr.id,
    source_doc_type: "stock_transfer",
    status: "completed",
    posted_at: new Date().toISOString(),
    notes: `調撥 ${tr.tr_no} 入庫`,
  });
  if (grErr) return { ok: false, error: `建立收貨單失敗：${grErr.message}` };

  // 5. 更新 stock_transfers
  await supabase
    .from("stock_transfers")
    .update({
      status: "received",
      qty_received_total: totalReceived,
      actual_arrival_date: today.toISOString().slice(0, 10),
      received_at: new Date().toISOString(),
    })
    .eq("id", transferId);

  // 6. 更新 lines qty_received
  for (const l of trLines) {
    await supabase
      .from("stock_transfer_lines")
      .update({ qty_received: l.qty_shipped })
      .eq("id", l.id);
  }

  revalidatePath("/parts/issue/transfer-out");
  revalidatePath("/parts/receipt/transfer-in");
  revalidatePath("/parts/operations/transfers-in-transit");
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { transfer_id: transferId, gr_no } };
}

/**
 * 取消調撥單（僅 in_transit 狀態可取消）：把 in_transit 庫存搬回 source 倉設為 available。
 */
export async function cancelTransfer(
  transferId: string,
): Promise<ActionResult<{ transfer_id: string }>> {
  if (!transferId) return { ok: false, error: "缺 transferId" };

  const supabase = await createClient();
  const brandId = getBrandKey();

  const { data: tr, error: trErr } = await supabase
    .from("stock_transfers")
    .select("id, tr_no, status, source_warehouse_id")
    .eq("id", transferId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (trErr || !tr) return { ok: false, error: `找不到調撥單：${trErr?.message ?? "no row"}` };
  if (tr.status === "cancelled") return { ok: false, error: "此調撥單已取消" };
  if (tr.status === "received" || tr.status === "closed") {
    return { ok: false, error: "已收貨的調撥單請走報損補單，不可直接取消" };
  }

  const { data: trLines } = await supabase
    .from("stock_transfer_lines")
    .select("id")
    .eq("tr_id", transferId);
  const lineIds = (trLines ?? []).map((l) => l.id);

  // 把 in_transit 庫存搬回 source 倉、status='available'
  if (lineIds.length > 0) {
    const { data: inTransit } = await supabase
      .from("stock_items")
      .select("id")
      .eq("brand_id", brandId)
      .in("source_transfer_line_id", lineIds)
      .eq("status", "in_transit");
    for (const r of inTransit ?? []) {
      await supabase
        .from("stock_items")
        .update({
          status: "available",
          warehouse_id: tr.source_warehouse_id,
          last_movement_at: new Date().toISOString(),
          notes: `調撥 ${tr.tr_no} 取消還原`,
        })
        .eq("id", r.id);
    }
  }

  await supabase
    .from("stock_transfers")
    .update({ status: "cancelled" })
    .eq("id", transferId);

  revalidatePath("/parts/issue/transfer-out");
  revalidatePath("/parts/receipt/transfer-in");
  revalidatePath("/parts/operations/transfers-in-transit");
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { transfer_id: transferId } };
}

// ──────────────────────────────────────────────────────────
// W3 領料退貨入庫 — 從 stock_issue_lines 部分退回入庫
// ──────────────────────────────────────────────────────────

export type ReturnIssueLinesInput = {
  issue_id: string;
  notes?: string;
  lines: Array<{
    line_id: string;
    qty_returned: number;
  }>;
};

/**
 * 領料退貨入庫：把 stock_issue_lines 部分退回庫存（建 stock_receipt 紀錄 + available 行）。
 * 與 cancelIssue 不同：cancel 是整單取消還原，這個是部分退（如師傅領 4 件用 3 件退 1 件）。
 */
export async function returnIssueLines(
  input: ReturnIssueLinesInput,
): Promise<ActionResult<{ receipt_id: string; gr_no: string; total_qty: number }>> {
  if (!input?.issue_id) return { ok: false, error: "缺 issue_id" };
  if (!input.lines?.length) return { ok: false, error: "至少需要一筆退貨明細" };
  for (const l of input.lines) {
    if (!l.line_id) return { ok: false, error: "明細缺 line_id" };
    if (!(l.qty_returned > 0)) return { ok: false, error: "明細數量需 > 0" };
  }

  const supabase = await createClient();
  const brandId = getBrandKey();

  // 1. 撈 issue + lines
  const { data: issue, error: issueErr } = await supabase
    .from("stock_issues")
    .select("id, gi_no, status, warehouse_id")
    .eq("id", input.issue_id)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (issueErr || !issue) return { ok: false, error: `找不到領料單：${issueErr?.message ?? "no row"}` };
  if (issue.status !== "completed") {
    return { ok: false, error: `領料單狀態 ${issue.status} 不可退貨（需 completed）` };
  }

  const lineIds = input.lines.map((l) => l.line_id);
  const { data: issueLines, error: linesErr } = await supabase
    .from("stock_issue_lines")
    .select("id, item_id, bin_id, qty_issued, unit_cost, serial_no, batch_no")
    .in("id", lineIds)
    .eq("brand_id", brandId);
  if (linesErr || !issueLines) return { ok: false, error: `撈領料明細失敗：${linesErr?.message ?? ""}` };
  const issueLineMap = new Map(issueLines.map((l) => [l.id, l]));

  // 2. 預檢：退貨數不可超過原領料數
  for (const l of input.lines) {
    const il = issueLineMap.get(l.line_id);
    if (!il) return { ok: false, error: `領料明細 ${l.line_id.slice(0, 8)} 不存在` };
    if (l.qty_returned > Number(il.qty_issued)) {
      return { ok: false, error: `退貨數 ${l.qty_returned} 超過領料數 ${il.qty_issued}` };
    }
  }

  // 3. 產 GR 號
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const { data: lastGr } = await supabase
    .from("stock_receipts")
    .select("gr_no")
    .eq("brand_id", brandId)
    .like("gr_no", `GR${dateStr}-%`)
    .order("gr_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (lastGr?.gr_no) {
    const m = lastGr.gr_no.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  const gr_no = `GR${dateStr}-${String(seq).padStart(3, "0")}`;

  const totalQty = input.lines.reduce((s, l) => s + l.qty_returned, 0);
  const totalAmount = input.lines.reduce((s, l) => {
    const il = issueLineMap.get(l.line_id)!;
    return s + l.qty_returned * Number(il.unit_cost ?? 0);
  }, 0);

  // 4. INSERT stock_receipts (type='ro_return')
  const { data: gr, error: grErr } = await supabase
    .from("stock_receipts")
    .insert({
      brand_id: brandId,
      gr_no,
      type: "ro_return",
      warehouse_id: issue.warehouse_id,
      receipt_date: today.toISOString().slice(0, 10),
      qty_received_total: totalQty,
      amount_total: Math.round(totalAmount * 100) / 100,
      source_doc_id: issue.id,
      source_doc_type: "stock_issue",
      status: "completed",
      posted_at: new Date().toISOString(),
      notes: input.notes ?? `領料 ${issue.gi_no} 部分退貨入庫`,
    })
    .select("id")
    .single();
  if (grErr) return { ok: false, error: `建立退貨入庫單失敗：${grErr.message}` };

  // 5. 建新的 available stock_items 還原
  const newStocks = input.lines.map((l) => {
    const il = issueLineMap.get(l.line_id)!;
    return {
      brand_id: brandId,
      item_id: il.item_id,
      warehouse_id: issue.warehouse_id,
      bin_id: il.bin_id,
      qty: l.qty_returned,
      unit_cost: il.unit_cost ?? 0,
      status: "available",
      serial_no: il.serial_no,
      batch_no: il.batch_no,
      notes: `領料 ${issue.gi_no} 退貨還原（GR ${gr_no}）`,
    };
  });
  const { error: stockErr } = await supabase.from("stock_items").insert(newStocks);
  if (stockErr) {
    // GR 已建但 stock 失敗 — 回收
    await supabase.from("stock_receipts").delete().eq("id", gr.id);
    return { ok: false, error: `還原庫存失敗：${stockErr.message}` };
  }

  revalidatePath("/parts/issue/repair-pick");
  revalidatePath("/parts/receipt/return-in");
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { receipt_id: gr.id, gr_no, total_qty: totalQty } };
}

// ──────────────────────────────────────────────────────────
// W4 盤點 — 計畫 / 啟動 / 提交 / 核准 4 動作閉環
// ──────────────────────────────────────────────────────────

export type CreateCountPlanInput = {
  plan_name: string;
  warehouse_id: string;
  plan_type?: "cycle" | "full" | "spot" | "abc_a" | "abc_b" | "abc_c";
  abc_filter?: "A" | "B" | "C" | "all";
  notes?: string;
};

export async function createCountPlanAction(
  input: CreateCountPlanInput,
): Promise<ActionResult<{ plan_id: string }>> {
  if (!input.plan_name?.trim()) return { ok: false, error: "計畫名稱必填" };
  if (!input.warehouse_id) return { ok: false, error: "倉庫必選" };

  const supabase = await createClient();
  const brandId = getBrandKey();

  const { data, error } = await supabase
    .from("inventory_count_plans")
    .insert({
      brand_id: brandId,
      plan_name: input.plan_name.trim(),
      warehouse_id: input.warehouse_id,
      plan_type: input.plan_type ?? "cycle",
      abc_filter: input.abc_filter ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `建計畫失敗：${error.message}` };

  revalidatePath("/parts/count/plans");
  return { ok: true, data: { plan_id: data.id } };
}

export type StartCountSessionInput = {
  warehouse_id: string;
  plan_id?: string;
  count_date?: string;
  abc_class_filter?: "A" | "B" | "C";
};

/**
 * 啟動盤點 session：拍當下 stock_items 做為 qty_system 快照，建 inventory_counts + lines。
 * status='counting'，等使用者填 qty_first。
 */
export async function startCountSessionAction(
  input: StartCountSessionInput,
): Promise<ActionResult<{ ct_id: string; ct_no: string; total_lines: number }>> {
  if (!input.warehouse_id) return { ok: false, error: "倉庫必選" };

  const supabase = await createClient();
  const brandId = getBrandKey();

  // 1. 拍 snapshot：當下倉內 status='available' 的 stock_items
  const { data: stocks, error: stockErr } = await supabase
    .from("stock_items")
    .select("item_id, bin_id, qty, unit_cost")
    .eq("brand_id", brandId)
    .eq("warehouse_id", input.warehouse_id)
    .eq("status", "available")
    .gt("qty", 0);
  if (stockErr) return { ok: false, error: `拍庫存快照失敗：${stockErr.message}` };

  // 聚合：同 item + bin 合併 qty
  const aggregated = new Map<string, { item_id: string; bin_id: string | null; qty: number; unit_cost: number }>();
  for (const s of stocks ?? []) {
    const key = `${s.item_id}::${s.bin_id ?? "_"}`;
    const cur = aggregated.get(key);
    if (cur) {
      cur.qty += Number(s.qty);
    } else {
      aggregated.set(key, {
        item_id: s.item_id,
        bin_id: s.bin_id,
        qty: Number(s.qty),
        unit_cost: Number(s.unit_cost ?? 0),
      });
    }
  }
  const snapshotLines = Array.from(aggregated.values());

  // 2. 產 ct_no = CT{YYYYMMDD}-{NNN}
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const { data: lastCt } = await supabase
    .from("inventory_counts")
    .select("ct_no")
    .eq("brand_id", brandId)
    .like("ct_no", `CT${dateStr}-%`)
    .order("ct_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (lastCt?.ct_no) {
    const m = lastCt.ct_no.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  const ct_no = `CT${dateStr}-${String(seq).padStart(3, "0")}`;

  // 3. INSERT inventory_counts
  const { data: ct, error: ctErr } = await supabase
    .from("inventory_counts")
    .insert({
      brand_id: brandId,
      ct_no,
      plan_id: input.plan_id ?? null,
      warehouse_id: input.warehouse_id,
      count_date: input.count_date ?? today.toISOString().slice(0, 10),
      status: "counting",
      total_lines: snapshotLines.length,
    })
    .select("id")
    .single();
  if (ctErr) return { ok: false, error: `建盤點 session 失敗：${ctErr.message}` };

  // 4. INSERT count_lines（qty_system 帶入）
  if (snapshotLines.length > 0) {
    const rows = snapshotLines.map((l, idx) => ({
      brand_id: brandId,
      ct_id: ct.id,
      line_no: idx + 1,
      item_id: l.item_id,
      bin_id: l.bin_id,
      qty_system: l.qty,
      unit_cost: l.unit_cost,
      status: "pending",
    }));
    const { error: linesErr } = await supabase.from("inventory_count_lines").insert(rows);
    if (linesErr) {
      await supabase.from("inventory_counts").delete().eq("id", ct.id);
      return { ok: false, error: `建盤點明細失敗：${linesErr.message}` };
    }
  }

  revalidatePath("/parts/count/sessions");
  return { ok: true, data: { ct_id: ct.id, ct_no, total_lines: snapshotLines.length } };
}

export type SubmitCountSessionInput = {
  ct_id: string;
  lines: Array<{
    line_id: string;
    qty_final: number;
  }>;
  notes?: string;
};

/**
 * 提交盤點：把 user 填的實盤數寫進 qty_final，計算 variance + variance_amount。
 * 先放 status='pending_approval'，等 approveCountAdjustment 完整 post。
 */
export async function submitCountSessionAction(
  input: SubmitCountSessionInput,
): Promise<ActionResult<{ ct_id: string; variance_lines: number; variance_amount: number }>> {
  if (!input.ct_id) return { ok: false, error: "缺 ct_id" };
  if (!input.lines?.length) return { ok: false, error: "至少需要一筆盤點數" };

  const supabase = await createClient();
  const brandId = getBrandKey();

  const { data: ct, error: ctErr } = await supabase
    .from("inventory_counts")
    .select("id, ct_no, status")
    .eq("id", input.ct_id)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (ctErr || !ct) return { ok: false, error: `找不到盤點單：${ctErr?.message ?? "no row"}` };
  if (!["counting", "first_done", "second_done"].includes(ct.status)) {
    return { ok: false, error: `狀態 ${ct.status} 不可提交（需 counting/first_done/second_done）` };
  }

  // 撈所有 lines 取得 qty_system + unit_cost
  const { data: existingLines, error: existErr } = await supabase
    .from("inventory_count_lines")
    .select("id, qty_system, unit_cost")
    .eq("ct_id", input.ct_id);
  if (existErr || !existingLines) return { ok: false, error: `撈盤點明細失敗：${existErr?.message ?? ""}` };
  const lineMap = new Map(existingLines.map((l) => [l.id, l]));

  let totalVarianceAmount = 0;
  let varianceLines = 0;
  for (const l of input.lines) {
    const existing = lineMap.get(l.line_id);
    if (!existing) continue;
    const qtySys = Number(existing.qty_system);
    const cost = Number(existing.unit_cost ?? 0);
    const variance = l.qty_final - qtySys;
    const varianceAmount = Math.round(variance * cost * 100) / 100;
    if (variance !== 0) {
      varianceLines++;
      totalVarianceAmount += varianceAmount;
    }
    await supabase
      .from("inventory_count_lines")
      .update({
        qty_first_count: l.qty_final,
        qty_final: l.qty_final,
        variance,
        variance_amount: varianceAmount,
        status: variance === 0 ? "reconciled" : "first_done",
      })
      .eq("id", l.line_id);
  }

  await supabase
    .from("inventory_counts")
    .update({
      status: "pending_approval",
      variance_lines: varianceLines,
      variance_amount: Math.round(totalVarianceAmount * 100) / 100,
      notes: input.notes ?? null,
    })
    .eq("id", input.ct_id);

  revalidatePath("/parts/count/sessions");
  revalidatePath("/parts/count/adjustments");
  return {
    ok: true,
    data: {
      ct_id: input.ct_id,
      variance_lines: varianceLines,
      variance_amount: Math.round(totalVarianceAmount * 100) / 100,
    },
  };
}

/**
 * 核准盤點：把有 variance 的 line 轉成 inventory_adjustments + 修 stock_items.qty。
 * inventory_counts.status='completed'。
 */
export async function approveCountAdjustmentAction(
  ctId: string,
): Promise<ActionResult<{ ct_id: string; adj_no: string | null; adjusted_lines: number }>> {
  if (!ctId) return { ok: false, error: "缺 ctId" };

  const supabase = await createClient();
  const brandId = getBrandKey();

  const { data: ct, error: ctErr } = await supabase
    .from("inventory_counts")
    .select("id, ct_no, status, warehouse_id, variance_lines, variance_amount")
    .eq("id", ctId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (ctErr || !ct) return { ok: false, error: `找不到盤點單：${ctErr?.message ?? "no row"}` };
  if (ct.status !== "pending_approval") {
    return { ok: false, error: `狀態 ${ct.status} 不可核准（需 pending_approval）` };
  }

  // 撈有 variance 的 lines
  const { data: varianceLines, error: lineErr } = await supabase
    .from("inventory_count_lines")
    .select("id, item_id, bin_id, qty_system, qty_final, variance, variance_amount, unit_cost")
    .eq("ct_id", ctId)
    .neq("variance", 0);
  if (lineErr) return { ok: false, error: `撈差異明細失敗：${lineErr.message}` };

  let adjNo: string | null = null;
  if (varianceLines && varianceLines.length > 0) {
    // 產 adj_no
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");
    const { data: lastAdj } = await supabase
      .from("inventory_adjustments")
      .select("adj_no")
      .eq("brand_id", brandId)
      .like("adj_no", `ADJ${dateStr}-%`)
      .order("adj_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    let seq = 1;
    if (lastAdj?.adj_no) {
      const m = lastAdj.adj_no.match(/-(\d+)$/);
      if (m) seq = parseInt(m[1], 10) + 1;
    }
    adjNo = `ADJ${dateStr}-${String(seq).padStart(3, "0")}`;

    const totalAmount = Number(ct.variance_amount);
    const type = totalAmount >= 0 ? "gain" : "loss";

    const { error: adjErr } = await supabase
      .from("inventory_adjustments")
      .insert({
        brand_id: brandId,
        adj_no: adjNo,
        ct_id: ct.id,
        warehouse_id: ct.warehouse_id,
        type,
        reason: `盤點 ${ct.ct_no} 差異報損報溢`,
        total_amount: totalAmount,
        status: "posted",
        approved_at: new Date().toISOString(),
        posted_at: new Date().toISOString(),
      });
    if (adjErr) return { ok: false, error: `建調整單失敗：${adjErr.message}` };

    // 對每個差異 line 調 stock_items
    for (const l of varianceLines) {
      // 找該 item + bin 在該倉的 stock_items（FIFO 取一個 row 增減 qty）
      let q = supabase
        .from("stock_items")
        .select("id, qty")
        .eq("brand_id", brandId)
        .eq("warehouse_id", ct.warehouse_id)
        .eq("item_id", l.item_id)
        .eq("status", "available");
      if (l.bin_id) q = q.eq("bin_id", l.bin_id);
      else q = q.is("bin_id", null);
      const { data: existing } = await q.order("created_at", { ascending: true }).limit(1).maybeSingle();

      const variance = Number(l.variance);
      if (existing) {
        const newQty = Math.max(0, Number(existing.qty) + variance);
        await supabase
          .from("stock_items")
          .update({
            qty: Math.round(newQty * 100) / 100,
            last_movement_at: new Date().toISOString(),
            notes: `盤點調整 ${ct.ct_no} ${variance >= 0 ? "+" : ""}${variance}`,
          })
          .eq("id", existing.id);
      } else if (variance > 0) {
        // 庫存無此 row 但盤多 → 建新 available 行
        await supabase.from("stock_items").insert({
          brand_id: brandId,
          item_id: l.item_id,
          warehouse_id: ct.warehouse_id,
          bin_id: l.bin_id,
          qty: variance,
          unit_cost: Number(l.unit_cost ?? 0),
          status: "available",
          notes: `盤點報溢新增 ${ct.ct_no}`,
        });
      }

      await supabase
        .from("inventory_count_lines")
        .update({ status: "adjusted" })
        .eq("id", l.id);
    }
  }

  await supabase
    .from("inventory_counts")
    .update({
      status: "completed",
      approved_at: new Date().toISOString(),
    })
    .eq("id", ctId);

  revalidatePath("/parts/count/sessions");
  revalidatePath("/parts/count/adjustments");
  revalidatePath("/parts/operations/balance");
  return {
    ok: true,
    data: {
      ct_id: ctId,
      adj_no: adjNo,
      adjusted_lines: varianceLines?.length ?? 0,
    },
  };
}

// ──────────────────────────────────────────────────────────
// W5 庫存作業 — 手動調整 / 例外出入庫 / 寄存登記
// ──────────────────────────────────────────────────────────

export type AdjustStockManualInput = {
  warehouse_id: string;
  reason: string;
  type?: "loss" | "gain" | "manual";
  lines: Array<{
    item_id: string;
    bin_id?: string;
    qty_diff: number;
    unit_cost?: number;
    notes?: string;
  }>;
};

/**
 * 備件手動調整：直接增減 stock_items.qty + 建 inventory_adjustments(type=manual) 紀錄。
 */
export async function adjustStockManualAction(
  input: AdjustStockManualInput,
): Promise<ActionResult<{ adj_id: string; adj_no: string }>> {
  if (!input.warehouse_id) return { ok: false, error: "倉庫必選" };
  if (!input.reason?.trim()) return { ok: false, error: "原因必填" };
  if (!input.lines?.length) return { ok: false, error: "至少需要一筆調整明細" };

  const supabase = await createClient();
  const brandId = getBrandKey();

  // 產 adj_no
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const { data: lastAdj } = await supabase
    .from("inventory_adjustments")
    .select("adj_no")
    .eq("brand_id", brandId)
    .like("adj_no", `ADJ${dateStr}-%`)
    .order("adj_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (lastAdj?.adj_no) {
    const m = lastAdj.adj_no.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  const adj_no = `ADJ${dateStr}-${String(seq).padStart(3, "0")}`;

  // 計 totals
  const totalAmount = input.lines.reduce(
    (s, l) => s + l.qty_diff * (l.unit_cost ?? 0),
    0,
  );
  const type =
    input.type ?? (totalAmount >= 0 ? "gain" : totalAmount < 0 ? "loss" : "manual");

  const { data: adj, error: adjErr } = await supabase
    .from("inventory_adjustments")
    .insert({
      brand_id: brandId,
      adj_no,
      warehouse_id: input.warehouse_id,
      type,
      reason: input.reason.trim(),
      total_amount: Math.round(totalAmount * 100) / 100,
      status: "posted",
      approved_at: new Date().toISOString(),
      posted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (adjErr) return { ok: false, error: `建調整單失敗：${adjErr.message}` };

  // 對每行調 stock_items
  for (const l of input.lines) {
    let q = supabase
      .from("stock_items")
      .select("id, qty")
      .eq("brand_id", brandId)
      .eq("warehouse_id", input.warehouse_id)
      .eq("item_id", l.item_id)
      .eq("status", "available");
    if (l.bin_id) q = q.eq("bin_id", l.bin_id);
    const { data: existing } = await q.order("created_at", { ascending: true }).limit(1).maybeSingle();

    if (existing) {
      const newQty = Math.max(0, Number(existing.qty) + l.qty_diff);
      await supabase
        .from("stock_items")
        .update({
          qty: Math.round(newQty * 100) / 100,
          last_movement_at: new Date().toISOString(),
          notes: `${adj_no}：${l.notes ?? input.reason}`,
        })
        .eq("id", existing.id);
    } else if (l.qty_diff > 0) {
      await supabase.from("stock_items").insert({
        brand_id: brandId,
        item_id: l.item_id,
        warehouse_id: input.warehouse_id,
        bin_id: l.bin_id,
        qty: l.qty_diff,
        unit_cost: l.unit_cost ?? 0,
        status: "available",
        notes: `${adj_no}：${l.notes ?? input.reason}`,
      });
    }
  }

  revalidatePath("/parts/operations/adjust");
  revalidatePath("/parts/operations/balance");
  revalidatePath("/parts/count/adjustments");
  return { ok: true, data: { adj_id: adj.id, adj_no } };
}

export type ExceptionMoveInput = {
  direction: "in" | "out";
  warehouse_id: string;
  reason: string;
  lines: Array<{
    item_id: string;
    bin_id?: string;
    qty: number;
    unit_cost?: number;
  }>;
};

/**
 * 例外出入庫：不走 PO/RO，直接增減庫存（建 stock_receipts type=exception 或 stock_issues type=exception）。
 */
export async function exceptionMoveAction(
  input: ExceptionMoveInput,
): Promise<ActionResult<{ doc_no: string }>> {
  if (!input.warehouse_id) return { ok: false, error: "倉庫必選" };
  if (!input.reason?.trim()) return { ok: false, error: "原因必填" };
  if (!input.lines?.length) return { ok: false, error: "至少需要一筆明細" };

  const supabase = await createClient();
  const brandId = getBrandKey();

  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");

  if (input.direction === "in") {
    // exception in：建 stock_receipts + 新 stock_items 行
    const { data: lastGr } = await supabase
      .from("stock_receipts")
      .select("gr_no").eq("brand_id", brandId)
      .like("gr_no", `GR${dateStr}-%`).order("gr_no", { ascending: false })
      .limit(1).maybeSingle();
    let seq = 1;
    if (lastGr?.gr_no) {
      const m = lastGr.gr_no.match(/-(\d+)$/);
      if (m) seq = parseInt(m[1], 10) + 1;
    }
    const gr_no = `GR${dateStr}-${String(seq).padStart(3, "0")}`;

    const totalQty = input.lines.reduce((s, l) => s + l.qty, 0);
    const totalAmount = input.lines.reduce((s, l) => s + l.qty * (l.unit_cost ?? 0), 0);

    const { error: grErr } = await supabase.from("stock_receipts").insert({
      brand_id: brandId,
      gr_no,
      type: "exception",
      warehouse_id: input.warehouse_id,
      receipt_date: today.toISOString().slice(0, 10),
      qty_received_total: totalQty,
      amount_total: Math.round(totalAmount * 100) / 100,
      status: "completed",
      posted_at: new Date().toISOString(),
      notes: `例外入庫：${input.reason}`,
    });
    if (grErr) return { ok: false, error: `建例外入庫單失敗：${grErr.message}` };

    const newStocks = input.lines.map((l) => ({
      brand_id: brandId,
      item_id: l.item_id,
      warehouse_id: input.warehouse_id,
      bin_id: l.bin_id,
      qty: l.qty,
      unit_cost: l.unit_cost ?? 0,
      status: "available",
      notes: `例外入庫 ${gr_no}：${input.reason}`,
    }));
    await supabase.from("stock_items").insert(newStocks);

    revalidatePath("/parts/operations/exceptions");
    revalidatePath("/parts/operations/balance");
    return { ok: true, data: { doc_no: gr_no } };
  } else {
    // exception out：建 stock_issues + 扣 stock_items
    // 先預檢
    for (const l of input.lines) {
      let q = supabase
        .from("stock_items")
        .select("id, qty")
        .eq("brand_id", brandId)
        .eq("warehouse_id", input.warehouse_id)
        .eq("item_id", l.item_id)
        .eq("status", "available");
      if (l.bin_id) q = q.eq("bin_id", l.bin_id);
      const { data: rows } = await q;
      const total = (rows ?? []).reduce((s, r) => s + Number(r.qty), 0);
      if (total < l.qty) {
        return { ok: false, error: `料件 ${l.item_id.slice(0, 8)} 庫存不足（有 ${total} 需 ${l.qty}）` };
      }
    }

    const { data: lastIss } = await supabase
      .from("stock_issues")
      .select("gi_no").eq("brand_id", brandId)
      .like("gi_no", `ISS${dateStr}-%`).order("gi_no", { ascending: false })
      .limit(1).maybeSingle();
    let seq = 1;
    if (lastIss?.gi_no) {
      const m = lastIss.gi_no.match(/-(\d+)$/);
      if (m) seq = parseInt(m[1], 10) + 1;
    }
    const gi_no = `ISS${dateStr}-${String(seq).padStart(3, "0")}`;

    const totalQty = input.lines.reduce((s, l) => s + l.qty, 0);
    const totalAmount = input.lines.reduce((s, l) => s + l.qty * (l.unit_cost ?? 0), 0);

    const { data: issue, error: issueErr } = await supabase
      .from("stock_issues")
      .insert({
        brand_id: brandId,
        gi_no,
        type: "exception",
        warehouse_id: input.warehouse_id,
        issue_date: today.toISOString().slice(0, 10),
        status: "completed",
        qty_issued_total: totalQty,
        amount_total: Math.round(totalAmount * 100) / 100,
        notes: `例外出庫：${input.reason}`,
        posted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (issueErr) return { ok: false, error: `建例外出庫單失敗：${issueErr.message}` };

    // 扣庫存（FIFO）
    const linesToInsert: Array<Record<string, unknown>> = [];
    let lineCounter = 1;
    for (const l of input.lines) {
      let q = supabase
        .from("stock_items")
        .select("id, qty, unit_cost, bin_id, serial_no, batch_no")
        .eq("brand_id", brandId)
        .eq("warehouse_id", input.warehouse_id)
        .eq("item_id", l.item_id)
        .eq("status", "available")
        .gt("qty", 0);
      if (l.bin_id) q = q.eq("bin_id", l.bin_id);
      const { data: rows } = await q.order("created_at", { ascending: true });
      let remaining = l.qty;
      for (const r of rows ?? []) {
        if (remaining <= 0) break;
        const take = Math.min(Number(r.qty), remaining);
        const cost = Number(r.unit_cost ?? 0);
        linesToInsert.push({
          brand_id: brandId,
          gi_id: issue.id,
          line_no: lineCounter++,
          item_id: l.item_id,
          bin_id: r.bin_id,
          qty_issued: take,
          uom: "個",
          unit_cost: cost,
          unit_price: cost,
          line_amount: Math.round(take * cost * 100) / 100,
        });
        const newQty = Number(r.qty) - take;
        await supabase
          .from("stock_items")
          .update({
            qty: Math.max(0, Math.round(newQty * 100) / 100),
            last_movement_at: new Date().toISOString(),
            ...(newQty <= 0 ? { status: "issued" } : {}),
          })
          .eq("id", r.id);
        remaining -= take;
      }
    }
    if (linesToInsert.length > 0) {
      await supabase.from("stock_issue_lines").insert(linesToInsert);
    }

    revalidatePath("/parts/operations/exceptions");
    revalidatePath("/parts/operations/balance");
    return { ok: true, data: { doc_no: gi_no } };
  }
}

export type RegisterConsignmentInput = {
  supplier_id: string;
  item_id: string;
  warehouse_id: string;
  bin_id?: string;
  initial_qty: number;
  unit_cost?: number;
  start_date: string;
  end_date: string;
  notes?: string;
};

/**
 * 寄存登記：建 consignment_stocks 行 + 同步建 stock_items 行 status='consignment'。
 */
export async function registerConsignmentAction(
  input: RegisterConsignmentInput,
): Promise<ActionResult<{ con_id: string; con_no: string }>> {
  if (!input.supplier_id) return { ok: false, error: "供應商必選" };
  if (!input.item_id) return { ok: false, error: "料件必選" };
  if (!input.warehouse_id) return { ok: false, error: "倉庫必選" };
  if (!(input.initial_qty > 0)) return { ok: false, error: "數量需 > 0" };
  if (!input.start_date || !input.end_date) return { ok: false, error: "起迄日必填" };

  const supabase = await createClient();
  const brandId = getBrandKey();

  // 產 con_no
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const { data: lastCon } = await supabase
    .from("consignment_stocks")
    .select("con_no")
    .eq("brand_id", brandId)
    .like("con_no", `CON${dateStr}-%`)
    .order("con_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (lastCon?.con_no) {
    const m = lastCon.con_no.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  const con_no = `CON${dateStr}-${String(seq).padStart(3, "0")}`;

  const { data: con, error: conErr } = await supabase
    .from("consignment_stocks")
    .insert({
      brand_id: brandId,
      con_no,
      supplier_id: input.supplier_id,
      item_id: input.item_id,
      warehouse_id: input.warehouse_id,
      bin_id: input.bin_id ?? null,
      initial_qty: input.initial_qty,
      remaining_qty: input.initial_qty,
      unit_cost: input.unit_cost ?? null,
      start_date: input.start_date,
      end_date: input.end_date,
      status: "active",
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (conErr) return { ok: false, error: `建寄存單失敗：${conErr.message}` };

  // 同步 stock_items 行（status='consignment'）
  await supabase.from("stock_items").insert({
    brand_id: brandId,
    item_id: input.item_id,
    warehouse_id: input.warehouse_id,
    bin_id: input.bin_id ?? null,
    qty: input.initial_qty,
    unit_cost: input.unit_cost ?? 0,
    status: "consignment",
    notes: `寄存 ${con_no}`,
  });

  revalidatePath("/parts/operations/consignment");
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { con_id: con.id, con_no } };
}

// ──────────────────────────────────────────────────────────
// W6 stub(後續 sprint 實作)
//
// 規則:這些 server action 永遠 return ok:false,UI 收到後顯示「下版開放」提示。
// 新增業務寫入功能時,保留 STUB_REGISTRY 的 key 但把對應 named export 改成真實作。
// ──────────────────────────────────────────────────────────

const STUB_REGISTRY = {
  // W2 出庫（issue.repair / issue.cancel 已升級為真實作）
  "issue.internal-sale":   { sprint: "W2", feature: "內售開單(整合 POS)" },

  // W3 入庫（transfer-out / transfer-in 已升級為真實作）
  "receipt.internal-sale": { sprint: "W3", feature: "內售入庫" },
  "receipt.return-in":     { sprint: "W3", feature: "領料退貨入庫" },

  // W4 盤點（已升級為真實作）

  // W5 庫存作業（已升級為真實作）

  // W6 預警 / 保固 / 分析
  "alerts.threshold":      { sprint: "W6", feature: "庫存水位設定" },
  "alerts.rule":           { sprint: "W6", feature: "新增告警規則" },
  "warranty.used-part":    { sprint: "W6", feature: "舊件登記入庫" },
  "warranty.cost-recovery":{ sprint: "W6", feature: "費用回收申請" },
  "analytics.abc-recalc":  { sprint: "W6", feature: "重跑 ABC 分類" },
} as const;

export type StubActionKey = keyof typeof STUB_REGISTRY;

/** 共用 stub:固定 return「下版開放 — XX 將於 WX sprint 開放」。 */
export async function runStubAction(key: StubActionKey): Promise<ActionResult> {
  const meta = STUB_REGISTRY[key];
  if (!meta) return { ok: false, error: `未知 stub action key: ${key}` };
  // 故意延遲 200ms 讓 UI 的 spinner 看得到
  await new Promise((r) => setTimeout(r, 200));
  return {
    ok: false,
    error: `下版開放 — ${meta.feature} 將於 ${meta.sprint} sprint 開放編輯`,
  };
}

// ── 命名 stub:供有具體語義場景呼叫,實作時直接替換 body ──
export async function issueForInternalSale(): Promise<ActionResult> { return runStubAction("issue.internal-sale"); }

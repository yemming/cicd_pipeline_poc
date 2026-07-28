/**
 * Parts 模組 server actions — 寫入操作（CRUD）。
 *
 * 規則（CRITICAL）：
 *   - 一律 `'use server'` + `createClient`(吃 RLS)— 禁用 createServiceClient
 *   - 所有寫入動作必須回傳 `{ ok: true, ... } | { ok: false, error: string }`
 *   - 寫 stock_items 時必須記 source_receipt_line_id / source_transfer_line_id 讓 audit trail 追得回原單據
 */

"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ItemInsert } from "../types";

import { getActiveScope } from "@/lib/scope/active-scope";
import { instantiateTransaction, TX_TYPES } from "@/domain/transactions";
import { HIGH_VALUE_VARIANCE_THRESHOLD } from "@/domain/count.constants";
import { createServiceClient } from "@/lib/supabase/service";
import { createInappNotifications } from "@/domain/user-notifications";
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

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
// 採購流程 PO mutations → 已遷至 @/domain/orders（2026-05-11）
// createPurchaseOrder / approvePurchaseOrder / cancelPurchaseOrder
// ──────────────────────────────────────────────────────────



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
  const brandId = (await getActiveScope()).brand_id;

  // 1. 撈 work order
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, ro_no, brand_id, customer_id, status, repair_order_id")
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

  // 消耗預留（inventory_reservations active → consumed）— 非阻塞、不影響主流程。
  // ⚠️ inventory_reservations.ro_id 的語意是 repair_orders.id（不是 work_orders.id）。
  //    預留由售後 RO（tech 工作台 / addon）建立、鍵在 repair_orders；此處的 work_order
  //    透過 repair_order_id 連結到那張 RO。先前誤用 wo.id 比對 → id 空間不符、永遠
  //    match 不到、預留從不被消耗（與場景一 issues.ts 同一個病）。改用 repair_order_id；
  //    無 repair_order_id（純倉管工單、TL 以外）則無對應預留可消耗，直接略過。
  const roIdForConsume = wo.repair_order_id;
  after(async () => {
    if (!roIdForConsume) return;
    try {
      // 彙整本次各 item 已領總量
      const issuedByItem = new Map<string, number>();
      for (const alloc of allocations) {
        issuedByItem.set(alloc.item_id, (issuedByItem.get(alloc.item_id) ?? 0) + alloc.qty_needed);
      }
      const nowIso = new Date().toISOString();
      for (const [itemId, qtyIssued] of issuedByItem) {
        const { data: reservations, error: resErr } = await supabase
          .from("inventory_reservations")
          .select("id, reserved_qty, consumed_qty")
          .eq("brand_id", brandId)
          .eq("item_id", itemId)
          .eq("ro_id", roIdForConsume)
          .eq("status", "active")
          .order("reserved_at", { ascending: true });
        if (resErr) {
          console.error("[issueForRepair consume reservation] 查預留失敗", { gi_no, item_id: itemId, error: resErr.message });
          continue;
        }
        let remaining = qtyIssued;
        for (const res of reservations ?? []) {
          if (remaining <= 0) break;
          const resQty = Number(res.reserved_qty);
          const alreadyConsumed = Number(res.consumed_qty ?? 0);
          const available = resQty - alreadyConsumed;
          if (available <= 0) continue;
          const toConsume = Math.min(available, remaining);
          const newConsumed = alreadyConsumed + toConsume;
          const newStatus = newConsumed >= resQty ? "consumed" : "active";
          const { error: updErr } = await supabase
            .from("inventory_reservations")
            .update({
              consumed_qty: newConsumed,
              status: newStatus,
              ...(newStatus === "consumed"
                ? { released_at: nowIso, release_reason: "issued", updated_at: nowIso }
                : { updated_at: nowIso }),
            })
            .eq("id", res.id)
            .eq("brand_id", brandId)
            .eq("status", "active");
          if (updErr) {
            console.error("[issueForRepair consume reservation] 更新失敗", { gi_no, reservation_id: res.id, error: updErr.message });
          }
          remaining -= toConsume;
        }
      }
    } catch (e) {
      console.error("[issueForRepair consume reservation] 例外（不影響主流程）", e);
    }
  });

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
  const brandId = (await getActiveScope()).brand_id;

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
  const brandId = (await getActiveScope()).brand_id;

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
 * 取消調撥單（僅 in_transit 狀態可取消）：把 in_transit 庫存搬回 source 倉設為 available。
 */
export async function cancelTransfer(
  transferId: string,
): Promise<ActionResult<{ transfer_id: string }>> {
  if (!transferId) return { ok: false, error: "缺 transferId" };

  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;

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
  const brandId = (await getActiveScope()).brand_id;

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
  plan_type?: "cycle" | "full" | "spot" | "abc_a" | "abc_b" | "abc_c" | "unannounced";
  abc_filter?: "A" | "B" | "C" | "all";
  /** 突擊盤點計畫：不設 next_run_at（隱藏排程避免預告） */
  is_unannounced?: boolean;
  notes?: string;
};

export async function createCountPlanAction(
  input: CreateCountPlanInput,
): Promise<ActionResult<{ plan_id: string }>> {
  if (!input.plan_name?.trim()) return { ok: false, error: "計畫名稱必填" };
  if (!input.warehouse_id) return { ok: false, error: "倉庫必選" };

  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;

  const isUnannounced = input.is_unannounced === true;

  const { data, error } = await supabase
    .from("inventory_count_plans")
    .insert({
      brand_id: brandId,
      plan_name: input.plan_name.trim(),
      warehouse_id: input.warehouse_id,
      plan_type: isUnannounced ? "unannounced" : (input.plan_type ?? "cycle"),
      abc_filter: input.abc_filter ?? null,
      // 突擊盤點不寫 next_run_at（避免排程時間外洩讓員工預知）
      next_run_at: isUnannounced ? null : undefined,
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
  count_type?: string;
  freeze_warehouse?: boolean;
  /** 突擊盤點：不公告、先盤後凍、不寫 next_run_at */
  is_unannounced?: boolean;
  notes?: string;
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
  const brandId = (await getActiveScope()).brand_id;

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

  // 突擊盤點：先盤後凍（freeze_warehouse=false）、不寫 next_run_at（避免預告時間）
  const isUnannounced = input.is_unannounced === true;
  const effectiveFreezeWarehouse = isUnannounced ? false : (input.freeze_warehouse ?? false);

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
      count_type: isUnannounced ? "unannounced" : (input.count_type ?? "manual"),
      freeze_warehouse: effectiveFreezeWarehouse,
      is_unannounced: isUnannounced,
      notes: input.notes ?? null,
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
  const brandId = (await getActiveScope()).brand_id;

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

  // 高價值盤差升級店長通知 — 改同步執行（不用 after()）。
  // ⚠️ 這裡原本包在 after() 裡（先懷疑是動態 import 在 Turbopack chunk 切割下失效，
  // 改靜態 import 後仍然一樣：user_notifications 表 event_code='stocktake.high_variance'
  // 部署後實測依舊 0 筆）。同檔案 ro-checkout-actions.ts 的 D+3/D+7 電訪任務、人車檔案同步
  // 都踩過同一顆雷（"修補二"／"包F"註解：after() 在本專案 Next.js 16 + Zeabur 這組部署環境
  // 實測不可靠，兩次測試 call_tasks 皆 0 筆），最終都改成同步執行才修好。這裡比照辦理：
  // 改同步 + try/catch 吞錯，不讓通知失敗擋住盤點提交主流程。
  const finalVarianceAmount = Math.round(totalVarianceAmount * 100) / 100;
  const finalVarianceLines = varianceLines;
  const ctNoForNotify = ct.ct_no;
  if (Math.abs(finalVarianceAmount) >= HIGH_VALUE_VARIANCE_THRESHOLD) {
    try {
      const sb = createServiceClient();
      // 找店長：is_cross_admin ∪ is_dept_manager（合集，不是 fallback）。
      // 原本是「先找 is_cross_admin，找到就不找 is_dept_manager」的嚴格 fallback —
      // 但只要品牌內存在任一個 is_cross_admin（例如系統總管理員），真正的「店長」
      // （is_dept_manager=true）就永遠收不到這條規則要求的通知，跟 Russell 指定
      // 「差異>5000自動升級通知店長」的字面要求不符（驗證用的 e2e 店長帳號
      // is_dept_manager=true 但 is_cross_admin=false，用嚴格 fallback 永遠測不到）。
      // 改成合集：兩種身分都通知，不影響既有的 is_cross_admin 收件人。
      const { data: crossAdmins } = await sb
        .from("employees")
        .select("user_id")
        .eq("brand_id", brandId)
        .eq("is_cross_admin", true)
        .eq("is_active", true)
        .not("user_id", "is", null)
        .limit(5);
      const { data: deptManagers } = await sb
        .from("employees")
        .select("user_id")
        .eq("brand_id", brandId)
        .eq("is_dept_manager", true)
        .eq("is_active", true)
        .not("user_id", "is", null)
        .limit(5);
      const managerIds: string[] = [
        ...new Set(
          [...(crossAdmins ?? []), ...(deptManagers ?? [])]
            .map((e: { user_id: string | null }) => e.user_id)
            .filter((id: string | null): id is string => !!id),
        ),
      ];
      if (managerIds.length > 0) {
        await createInappNotifications(
          managerIds.map((uid) => ({
            recipient_user_id: uid,
            brand_id: brandId,
            title: "盤差金額超標・需覆核",
            body: `盤點單 ${ctNoForNotify} 盤差金額 NT$ ${Math.round(Math.abs(finalVarianceAmount)).toLocaleString("zh-TW")}（${finalVarianceLines} 筆差異行），已超過高價值閾值，請盡速審批。`,
            priority: "red" as const,
            event_code: "stocktake.high_variance",
            href: `/parts/count/adjustments`,
          })),
        );
      } else {
        // 找不到店長：發給當前操作者並標 TODO
        const currentUserSb = await createClient();
        const { data: { user: currentUser } } = await currentUserSb.auth.getUser();
        if (currentUser?.id) {
          await createInappNotifications([{
            recipient_user_id: currentUser.id,
            brand_id: brandId,
            title: "盤差金額超標・需覆核（TODO: 找不到店長）",
            body: `盤點單 ${ctNoForNotify} 盤差金額 NT$ ${Math.round(Math.abs(finalVarianceAmount)).toLocaleString("zh-TW")}（${finalVarianceLines} 筆差異行）。系統找不到 is_cross_admin / is_dept_manager 員工，請手動通知主管。`,
            priority: "red" as const,
            event_code: "stocktake.high_variance",
            href: `/parts/count/adjustments`,
          }]);
        }
      }
    } catch (e) {
      console.error("[submitCountSession] 高價值盤差通知例外（不影響主流程）", e);
    }
  }

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
  const brandId = (await getActiveScope()).brand_id;

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

  if (varianceLines && varianceLines.length > 0 && adjNo) {
    const totalAmount = Number(ct.variance_amount);
    const txType =
      totalAmount > 0
        ? TX_TYPES.STOCK_ADJUSTMENT_GAIN
        : totalAmount < 0
          ? TX_TYPES.STOCK_ADJUSTMENT_LOSS
          : null;
    if (txType) {
      const firstLine = varianceLines[0];
      after(async () => {
        const res = await instantiateTransaction(
          txType,
          {
            item_id: firstLine.item_id,
            warehouse_id: ct.warehouse_id,
            net_amount: Math.abs(totalAmount),
          },
          { autoPost: true },
        );
        if (!res.ok) {
          console.error("[accounting] STOCK_ADJUSTMENT 自動過帳失敗", {
            adj_no: adjNo,
            tx_type: txType,
            error: res.error,
          });
        } else {
          console.log("[accounting] STOCK_ADJUSTMENT 已自動過帳（posted）", {
            adj_no: adjNo,
            tx_type: txType,
            journal_entry: res.data,
          });
        }
      });
    }
  }

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
  const brandId = (await getActiveScope()).brand_id;

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

  const txType =
    type === "gain"
      ? TX_TYPES.STOCK_ADJUSTMENT_GAIN
      : type === "loss"
        ? TX_TYPES.STOCK_ADJUSTMENT_LOSS
        : null;
  if (txType && input.lines[0]) {
    const firstLine = input.lines[0];
    const netAmount = Math.abs(Math.round(totalAmount * 100) / 100);
    after(async () => {
      const res = await instantiateTransaction(
        txType,
        {
          item_id: firstLine.item_id,
          warehouse_id: input.warehouse_id,
          net_amount: netAmount,
        },
        { autoPost: true },
      );
      if (!res.ok) {
        console.error("[accounting] STOCK_ADJUSTMENT 自動過帳失敗（manual）", {
          adj_no,
          tx_type: txType,
          error: res.error,
        });
      } else {
        console.log("[accounting] STOCK_ADJUSTMENT 已自動過帳（posted, manual）", {
          adj_no,
          tx_type: txType,
          journal_entry: res.data,
        });
      }
    });
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
  const brandId = (await getActiveScope()).brand_id;

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
  const brandId = (await getActiveScope()).brand_id;

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
// W6 預警 / 保固 / 分析
// ──────────────────────────────────────────────────────────

export type UpsertStockThresholdInput = {
  warehouse_id: string;
  item_id: string;
  min_stock: number;
  reorder_point: number;
  max_stock?: number;
  abc_class?: "A" | "B" | "C";
  alert_priority?: "low" | "medium" | "high" | "critical";
};

export async function upsertStockThresholdAction(
  input: UpsertStockThresholdInput,
): Promise<ActionResult<{ id: string }>> {
  if (!input.warehouse_id || !input.item_id) return { ok: false, error: "倉庫 / 料件必選" };
  if (input.min_stock < 0 || input.reorder_point < 0) return { ok: false, error: "min/reorder 不可為負" };

  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;

  const { data, error } = await supabase
    .from("stock_thresholds")
    .upsert(
      {
        brand_id: brandId,
        warehouse_id: input.warehouse_id,
        item_id: input.item_id,
        min_stock: input.min_stock,
        reorder_point: input.reorder_point,
        max_stock: input.max_stock ?? null,
        abc_class: input.abc_class ?? null,
        alert_priority: input.alert_priority ?? "medium",
        is_active: true,
      },
      { onConflict: "warehouse_id,item_id" },
    )
    .select("id")
    .single();
  if (error) return { ok: false, error: `寫水位失敗：${error.message}` };

  revalidatePath("/parts/alerts/thresholds");
  return { ok: true, data: { id: data.id } };
}

export type CreateAlertRuleInput = {
  code: string;
  name: string;
  alert_type:
    | "stock_level"
    | "ro_shortage"
    | "transfer_overdue"
    | "consignment_expire"
    | "dead_stock"
    | "warranty_expire"
    | "custom";
  severity?: "low" | "medium" | "high" | "critical";
  auto_action?: "notify" | "create_requisition" | "create_transfer" | "none";
  cooldown_minutes?: number;
  notes?: string;
};

export async function createAlertRuleAction(
  input: CreateAlertRuleInput,
): Promise<ActionResult<{ id: string }>> {
  if (!input.code?.trim() || !input.name?.trim()) return { ok: false, error: "code / name 必填" };

  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;

  const { data, error } = await supabase
    .from("alert_rules")
    .insert({
      brand_id: brandId,
      code: input.code.trim(),
      name: input.name.trim(),
      alert_type: input.alert_type,
      severity: input.severity ?? "medium",
      auto_action: input.auto_action ?? "notify",
      cooldown_minutes: input.cooldown_minutes ?? 60,
      notes: input.notes ?? null,
      is_enabled: true,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `建告警規則失敗：${error.message}` };

  revalidatePath("/parts/alerts/rules");
  return { ok: true, data: { id: data.id } };
}

export type RegisterOldPartInput = {
  wc_no: string;
  ro_id?: string;
  cl_id?: string;
  item_id: string;
  serial_no?: string;
  vin?: string;
  warehouse_id?: string;
  bin_id?: string;
  expiry_date?: string;
  disposal_action?:
    | "return_oem"
    | "return_agent"
    | "destroy_onsite"
    | "recycle"
    | "retain"
    | "pending";
  notes?: string;
};

export async function registerOldPartAction(
  input: RegisterOldPartInput,
): Promise<ActionResult<{ id: string }>> {
  if (!input.wc_no?.trim()) return { ok: false, error: "wc_no 必填" };
  if (!input.item_id) return { ok: false, error: "料件必選" };

  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;

  const { data, error } = await supabase
    .from("old_parts")
    .insert({
      brand_id: brandId,
      wc_no: input.wc_no.trim(),
      ro_id: input.ro_id ?? null,
      cl_id: input.cl_id ?? null,
      item_id: input.item_id,
      serial_no: input.serial_no ?? null,
      vin: input.vin ?? null,
      warehouse_id: input.warehouse_id ?? null,
      bin_id: input.bin_id ?? null,
      expiry_date: input.expiry_date ?? null,
      disposal_action: input.disposal_action ?? "pending",
      status: "in_storage",
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `登記舊件失敗：${error.message}` };

  revalidatePath("/parts/warranty/used-parts");
  return { ok: true, data: { id: data.id } };
}

/**
 * 重跑 ABC：以最近 12 個月 stock_issues 出貨總額排序料件，
 * cum_pct ≤ thresholdA → A，≤ thresholdB → B，其他 C。
 * 寫到 abc_classification_results（每料一行，無 warehouse 維度）。
 */
export async function recalcAbcAction(): Promise<
  ActionResult<{ items_classified: number; a_count: number; b_count: number; c_count: number }>
> {
  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;

  // 1. 撈 config（取 threshold）
  const { data: config } = await supabase
    .from("abc_classification_config")
    .select("threshold_a_pct, threshold_b_pct, rolling_period_months")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .maybeSingle();
  const thresholdA = Number(config?.threshold_a_pct ?? 80);
  const thresholdB = Number(config?.threshold_b_pct ?? 95);
  const months = Number(config?.rolling_period_months ?? 12);

  // 2. 撈最近 N 個月 stock_issue_lines + 對應 issue.posted_at
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const { data: issues } = await supabase
    .from("stock_issues")
    .select("id, posted_at")
    .eq("brand_id", brandId)
    .eq("status", "completed")
    .gte("posted_at", cutoff.toISOString());
  const issueIds = (issues ?? []).map((i) => i.id);
  let lines: Array<{ item_id: string; qty_issued: number; line_amount: number }> = [];
  if (issueIds.length > 0) {
    const { data, error } = await supabase
      .from("stock_issue_lines")
      .select("item_id, qty_issued, line_amount")
      .eq("brand_id", brandId)
      .in("gi_id", issueIds);
    if (error) return { ok: false, error: `撈出貨明細失敗：${error.message}` };
    lines = data ?? [];
  }

  // 3. 聚合 by item
  const byItem = new Map<string, { qty: number; amount: number }>();
  for (const l of lines) {
    const cur = byItem.get(l.item_id) ?? { qty: 0, amount: 0 };
    cur.qty += Number(l.qty_issued);
    cur.amount += Number(l.line_amount ?? 0);
    byItem.set(l.item_id, cur);
  }

  // 4. 補上「沒出過」的 active items（class='C'）
  const { data: allItems } = await supabase
    .from("items")
    .select("id")
    .eq("brand_id", brandId)
    .eq("is_active", true);
  for (const it of allItems ?? []) {
    if (!byItem.has(it.id)) byItem.set(it.id, { qty: 0, amount: 0 });
  }

  // 5. 排序 + 分類
  const totalAmount = Array.from(byItem.values()).reduce((s, v) => s + v.amount, 0);
  const ranked = Array.from(byItem.entries())
    .map(([item_id, v]) => ({ item_id, qty: v.qty, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount);

  let cumAmount = 0;
  const classified = ranked.map((r, idx) => {
    cumAmount += r.amount;
    const cumPct = totalAmount > 0 ? (cumAmount / totalAmount) * 100 : 0;
    let abc: "A" | "B" | "C" = "C";
    if (totalAmount === 0) abc = "C";
    else if (cumPct <= thresholdA) abc = "A";
    else if (cumPct <= thresholdB) abc = "B";
    return {
      item_id: r.item_id,
      output_qty_12m: r.qty,
      output_amount_12m: r.amount,
      rank_in_brand: idx + 1,
      cum_pct: Math.round(cumPct * 100) / 100,
      abc_class: abc,
    };
  });

  // 6. 撈 prev class 並 upsert（抓 prev 才能寫到 prev_class）
  const { data: prevResults } = await supabase
    .from("abc_classification_results")
    .select("item_id, abc_class")
    .eq("brand_id", brandId)
    .is("warehouse_id", null);
  const prevMap = new Map((prevResults ?? []).map((p) => [p.item_id, p.abc_class]));

  // 7. 清舊 + 寫新（沒有 unique 約束，先 delete 再 insert 比較簡單）
  await supabase
    .from("abc_classification_results")
    .delete()
    .eq("brand_id", brandId)
    .is("warehouse_id", null);

  if (classified.length > 0) {
    const rows = classified.map((c) => ({
      brand_id: brandId,
      item_id: c.item_id,
      warehouse_id: null,
      abc_class: c.abc_class,
      output_qty_12m: c.output_qty_12m,
      output_amount_12m: c.output_amount_12m,
      rank_in_brand: c.rank_in_brand,
      cum_pct: c.cum_pct,
      prev_class: prevMap.get(c.item_id) ?? null,
      recalc_at: new Date().toISOString(),
    }));
    const { error: insErr } = await supabase.from("abc_classification_results").insert(rows);
    if (insErr) return { ok: false, error: `寫 ABC 結果失敗：${insErr.message}` };
  }

  // 8. 更新 config.last_recalc_at
  await supabase
    .from("abc_classification_config")
    .update({ last_recalc_at: new Date().toISOString() })
    .eq("brand_id", brandId);

  const aCount = classified.filter((c) => c.abc_class === "A").length;
  const bCount = classified.filter((c) => c.abc_class === "B").length;
  const cCount = classified.filter((c) => c.abc_class === "C").length;

  revalidatePath("/parts/analytics/abc");
  return {
    ok: true,
    data: {
      items_classified: classified.length,
      a_count: aCount,
      b_count: bCount,
      c_count: cCount,
    },
  };
}

// ──────────────────────────────────────────────────────────
// 剩餘 stub
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

  // W6（threshold/rule/used-part/abc 已升級為真實作）
  "warranty.cost-recovery":{ sprint: "W6", feature: "費用回收申請" },
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

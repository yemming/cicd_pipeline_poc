"use server";

/**
 * Domain Helper — Stock Transfers（調撥）
 *
 * Read：listTransfers / getTransferInPageData
 * Mutations：receiveTransfer
 *   （從 src/lib/parts/actions/index.ts L726-842 遷入；Result<T> 沿用 domain 慣例）
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
export type StockTransferRow = Tables["stock_transfers"]["Row"];

export type TransferListRow = StockTransferRow & {
  source_warehouse_name: string | null;
  target_warehouse_name: string | null;
};

export async function listTransfers(filter: {
  status_in?: string[];
  q?: string;
} = {}): Promise<TransferListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("stock_transfers")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("ship_date", { ascending: false })
    .limit(200);
  if (filter.status_in?.length) q = q.in("status", filter.status_in);
  if (filter.q) q = q.ilike("tr_no", `%${filter.q}%`);

  const { data: ts, error } = await q;
  if (error) throw error;
  if (!ts || ts.length === 0) return [];

  const wIds = Array.from(
    new Set(
      ts
        .flatMap((t) => [t.source_warehouse_id, t.target_warehouse_id])
        .filter((x): x is string => !!x),
    ),
  );
  const wRes = wIds.length > 0
    ? await supabase.from("warehouses").select("id, name").in("id", wIds)
    : { data: [], error: null };
  if (wRes.error) throw wRes.error;
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  return ts.map((t) => ({
    ...t,
    source_warehouse_name: t.source_warehouse_id ? wMap.get(t.source_warehouse_id) ?? null : null,
    target_warehouse_name: t.target_warehouse_id ? wMap.get(t.target_warehouse_id) ?? null : null,
  }));
}

export async function getTransferInPageData(): Promise<{
  rows: TransferListRow[];
  canEdit: boolean;
}> {
  const [rows, canEdit] = await Promise.all([
    listTransfers({ status_in: ["in_transit", "partial", "received"] }),
    hasPermission(PERMISSIONS.RECEIPT_CREATE),
  ]);
  return { rows, canEdit };
}

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

/**
 * 收貨入庫：把該調撥單對應的 stock_items（status='in_transit', source_transfer_line_id 對應）
 * 翻成 'available'。同時建 stock_receipts 紀錄；更新 stock_transfers.status='received'。
 *
 * 從 src/lib/parts/actions/index.ts 遷入（邏輯一字不動）。
 */
export async function receiveTransfer(
  transferId: string,
): Promise<Result<{ transfer_id: string; gr_no: string }>> {
  if (!transferId) return { ok: false, error: "缺 transferId" };

  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;

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

// ─────────────────────────────────────────────────────────────
// Detail / Update / Void
// ─────────────────────────────────────────────────────────────

export type StockTransferDetailLine = {
  id: string;
  line_no: number;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  qty_requested: number;
  qty_shipped: number;
  qty_received: number;
  uom: string;
  unit_cost: number;
  source_bin_id: string | null;
  source_bin_label: string | null;
  target_bin_id: string | null;
  target_bin_label: string | null;
  notes: string | null;
};

export type StockTransferDetail = StockTransferRow & {
  source_warehouse_name: string | null;
  target_warehouse_name: string | null;
  shipped_by_name: string | null;
  received_by_name: string | null;
  voided_by_name: string | null;
  lines: StockTransferDetailLine[];
};

export async function getTransferById(
  id: string,
): Promise<StockTransferDetail | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: t, error } = await supabase
    .from("stock_transfers")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (error) throw error;
  if (!t) return null;

  // 名字 joins
  const [srcW, tgtW, shipUser, recvUser, voidUser] = await Promise.all([
    t.source_warehouse_id
      ? supabase.from("warehouses").select("name").eq("id", t.source_warehouse_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    t.target_warehouse_id
      ? supabase.from("warehouses").select("name").eq("id", t.target_warehouse_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    t.shipped_by
      ? supabase.from("profiles").select("display_name").eq("id", t.shipped_by).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    t.received_by
      ? supabase.from("profiles").select("display_name").eq("id", t.received_by).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    t.voided_by
      ? supabase.from("profiles").select("display_name").eq("id", t.voided_by).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
  ]);

  // lines + item / bins joins
  const { data: rawLines, error: lineErr } = await supabase
    .from("stock_transfer_lines")
    .select(
      "id, line_no, item_id, qty_requested, qty_shipped, qty_received, uom, unit_cost, source_bin_id, target_bin_id, notes",
    )
    .eq("tr_id", id)
    .order("line_no", { ascending: true });
  if (lineErr) throw lineErr;

  const itemIds = Array.from(new Set((rawLines ?? []).map((l) => l.item_id)));
  const binIds = Array.from(
    new Set(
      (rawLines ?? [])
        .flatMap((l) => [l.source_bin_id, l.target_bin_id])
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

  const lines: StockTransferDetailLine[] = (rawLines ?? []).map((l) => ({
    id: l.id,
    line_no: l.line_no,
    item_id: l.item_id,
    item_code: itemMap.get(l.item_id)?.code ?? null,
    item_name: itemMap.get(l.item_id)?.name ?? null,
    qty_requested: Number(l.qty_requested ?? 0),
    qty_shipped: Number(l.qty_shipped ?? 0),
    qty_received: Number(l.qty_received ?? 0),
    uom: l.uom,
    unit_cost: Number(l.unit_cost ?? 0),
    source_bin_id: l.source_bin_id,
    source_bin_label: l.source_bin_id ? binMap.get(l.source_bin_id) ?? null : null,
    target_bin_id: l.target_bin_id,
    target_bin_label: l.target_bin_id ? binMap.get(l.target_bin_id) ?? null : null,
    notes: l.notes,
  }));

  return {
    ...t,
    source_warehouse_name: srcW.data?.name ?? null,
    target_warehouse_name: tgtW.data?.name ?? null,
    shipped_by_name: shipUser.data?.display_name ?? null,
    received_by_name: recvUser.data?.display_name ?? null,
    voided_by_name: voidUser.data?.display_name ?? null,
    lines,
  };
}

export type UpdateTransferInput = {
  notes?: string | null;
  reason?: string | null;
  expected_arrival_date?: string | null;
  logistics_provider?: string | null;
  logistics_tracking_no?: string | null;
  line_notes?: Array<{ id: string; notes: string | null }>;
};

/**
 * 更新調撥單 — 限定不影響庫存帳的欄位
 */
export async function updateTransfer(
  id: string,
  patch: UpdateTransferInput,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有編輯調撥單的權限" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: current, error: curErr } = await supabase
    .from("stock_transfers")
    .select("status")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (curErr) return { ok: false, error: curErr.message };
  if (!current) return { ok: false, error: "找不到調撥單" };
  if (current.status === "cancelled") {
    return { ok: false, error: "已作廢的調撥單不可修改" };
  }

  const headerPatch: Record<string, unknown> = {};
  if (patch.notes !== undefined) headerPatch.notes = patch.notes;
  if (patch.reason !== undefined) headerPatch.reason = patch.reason;
  if (patch.expected_arrival_date !== undefined) headerPatch.expected_arrival_date = patch.expected_arrival_date;
  if (patch.logistics_provider !== undefined) headerPatch.logistics_provider = patch.logistics_provider;
  if (patch.logistics_tracking_no !== undefined) headerPatch.logistics_tracking_no = patch.logistics_tracking_no;

  if (Object.keys(headerPatch).length > 0) {
    const { error: upErr } = await supabase
      .from("stock_transfers")
      .update(headerPatch)
      .eq("id", id);
    if (upErr) return { ok: false, error: upErr.message };
  }

  if (patch.line_notes && patch.line_notes.length > 0) {
    for (const ln of patch.line_notes) {
      const { error: lnErr } = await supabase
        .from("stock_transfer_lines")
        .update({ notes: ln.notes })
        .eq("id", ln.id)
        .eq("tr_id", id);
      if (lnErr) return { ok: false, error: `明細備註更新失敗:${lnErr.message}` };
    }
  }

  revalidatePath("/parts/receipt/transfer-in");
  revalidatePath(`/parts/receipt/transfer-in/${id}`);
  return { ok: true, data: { id } };
}

/**
 * 作廢調撥單 — 僅 status='received' 可作廢
 * 反向：刪 target wh stock_items + 刪派生 stock_receipts + 還原 lines.qty_received=0
 * 守門：任一 stock_item 已被消耗 → 阻擋
 */
export async function voidTransfer(
  id: string,
  reason: string,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有作廢調撥單的權限" };
  }
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "請填寫作廢原因" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  // 1. 撈調撥單
  const { data: tr, error: trErr } = await supabase
    .from("stock_transfers")
    .select("id, status")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (trErr) return { ok: false, error: trErr.message };
  if (!tr) return { ok: false, error: "找不到調撥單" };
  if (tr.status === "cancelled") return { ok: false, error: "此調撥單已作廢" };
  if (tr.status !== "received") {
    return {
      ok: false,
      error: `狀態 ${tr.status} 不可作廢（僅已收貨可作廢；在途調撥請至 transfer-out 取消）`,
    };
  }

  // 2. 撈 lines
  const { data: lines, error: lineErr } = await supabase
    .from("stock_transfer_lines")
    .select("id")
    .eq("tr_id", id);
  if (lineErr) return { ok: false, error: lineErr.message };
  if (!lines || lines.length === 0) {
    return { ok: false, error: "此調撥單無明細，無法作廢" };
  }

  // 3. 守門：stock_items 都還 available
  const lineIds = lines.map((l) => l.id);
  const { data: stockItems, error: siErr } = await supabase
    .from("stock_items")
    .select("id, status")
    .in("source_transfer_line_id", lineIds);
  if (siErr) return { ok: false, error: siErr.message };
  const consumed = (stockItems ?? []).filter((s) => s.status !== "available");
  if (consumed.length > 0) {
    return {
      ok: false,
      error: `${consumed.length} 筆庫存已被消耗（出貨／領料／再調撥），不可作廢；請先處理後續單據`,
    };
  }

  // 4. 刪 stock_items
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

  // 5. 刪派生的 stock_receipts row（type='transfer'）
  await supabase
    .from("stock_receipts")
    .delete()
    .eq("source_doc_id", id)
    .eq("source_doc_type", "stock_transfer");

  // 6. 還原 lines.qty_received
  await supabase
    .from("stock_transfer_lines")
    .update({ qty_received: 0 })
    .eq("tr_id", id);

  // 7. 標記 transfer 為 cancelled
  const { data: { user } } = await supabase.auth.getUser();
  const { error: voidErr } = await supabase
    .from("stock_transfers")
    .update({
      status: "cancelled",
      qty_received_total: 0,
      received_at: null,
      received_by: null,
      actual_arrival_date: null,
      voided_at: new Date().toISOString(),
      voided_by: user?.id ?? null,
      void_reason: trimmed,
    })
    .eq("id", id);
  if (voidErr) return { ok: false, error: `標記作廢失敗:${voidErr.message}` };

  revalidatePath("/parts/issue/transfer-out");
  revalidatePath("/parts/receipt/transfer-in");
  revalidatePath(`/parts/receipt/transfer-in/${id}`);
  revalidatePath("/parts/operations/transfers-in-transit");
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { id } };
}

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
  status?: string;
  q?: string;
  source_warehouse_id?: string;
  target_warehouse_id?: string;
} = {}): Promise<TransferListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("stock_transfers")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("ship_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter.status_in?.length) q = q.in("status", filter.status_in);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.source_warehouse_id) q = q.eq("source_warehouse_id", filter.source_warehouse_id);
  if (filter.target_warehouse_id) q = q.eq("target_warehouse_id", filter.target_warehouse_id);
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

/**
 * Paged variant — 給 transfers-in-transit / 未來其他需分頁的查詢用。
 * 不破壞性升級：原 `listTransfers()` 保留，這支獨立。
 */
export async function listTransfersPaged(
  filter: {
    status_in?: string[];
    status?: string;
    q?: string;
    source_warehouse_id?: string;
    target_warehouse_id?: string;
    date_from?: string;
    date_to?: string;
  } = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: TransferListRow[]; totalCount: number }> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? 50);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("stock_transfers")
    .select("*", { count: "exact" })
    .eq("brand_id", scope.brand_id)
    .order("ship_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (filter.status_in?.length) q = q.in("status", filter.status_in);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.source_warehouse_id) q = q.eq("source_warehouse_id", filter.source_warehouse_id);
  if (filter.target_warehouse_id) q = q.eq("target_warehouse_id", filter.target_warehouse_id);
  if (filter.q) q = q.ilike("tr_no", `%${filter.q}%`);
  if (filter.date_from) q = q.gte("ship_date", filter.date_from);
  if (filter.date_to) q = q.lte("ship_date", filter.date_to);

  const { data: ts, count, error } = await q;
  if (error) throw error;
  if (!ts || ts.length === 0) return { rows: [], totalCount: count ?? 0 };

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

  return {
    rows: ts.map((t) => ({
      ...t,
      source_warehouse_name: t.source_warehouse_id ? wMap.get(t.source_warehouse_id) ?? null : null,
      target_warehouse_name: t.target_warehouse_id ? wMap.get(t.target_warehouse_id) ?? null : null,
    })),
    totalCount: count ?? 0,
  };
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
// Transfer-Out（出貨方視角）— list + form + preview + mutations
// ─────────────────────────────────────────────────────────────

export async function getTransferOutPageData(filter: {
  status?: string;
  q?: string;
  source_warehouse_id?: string;
} = {}): Promise<{
  rows: TransferListRow[];
  canEdit: boolean;
  warehouses: Array<{ id: string; code: string | null; name: string }>;
}> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const [rows, canEdit, whRes] = await Promise.all([
    listTransfers(filter),
    hasPermission(PERMISSIONS.TRANSFER_CREATE),
    supabase
      .from("warehouses")
      .select("id, code, name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code"),
  ]);

  return {
    rows,
    canEdit,
    warehouses: (whRes.data ?? []) as Array<{ id: string; code: string | null; name: string }>,
  };
}

export type NewTransferFormData = {
  warehouses: Array<{ id: string; code: string | null; name: string }>;
  items: Array<{ id: string; code: string; name: string; base_uom: string | null }>;
};

export async function getNewTransferFormData(): Promise<NewTransferFormData> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const [whRes, itemRes] = await Promise.all([
    supabase
      .from("warehouses")
      .select("id, code, name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("items")
      .select("id, code, name, base_uom")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code")
      .limit(500),
  ]);
  return {
    warehouses: (whRes.data ?? []) as NewTransferFormData["warehouses"],
    items: (itemRes.data ?? []) as NewTransferFormData["items"],
  };
}

export type TransferPreviewLine = {
  line_no: number;
  item_id: string;
  item_code: string | null;
  item_name: string;
  qty_requested: number;
  qty_available: number;
  shortage: number;
  picks: Array<{
    stock_id: string;
    bin_id: string | null;
    bin_label: string | null;
    qty: number;
    unit_cost: number;
    serial_no: string | null;
    batch_no: string | null;
  }>;
};

export type TransferPreview = {
  source_warehouse_id: string;
  target_warehouse_id: string;
  lines: TransferPreviewLine[];
  can_post: boolean;
  qty_total: number;
  amount_total: number;
};

export async function previewTransfer(input: {
  source_warehouse_id: string;
  target_warehouse_id: string;
  lines: Array<{ item_id: string; qty_requested: number; source_bin_id?: string | null }>;
}): Promise<Result<TransferPreview>> {
  if (!input.source_warehouse_id) return { ok: false, error: "缺來源倉" };
  if (!input.target_warehouse_id) return { ok: false, error: "缺目標倉" };
  if (input.source_warehouse_id === input.target_warehouse_id) {
    return { ok: false, error: "來源倉與目標倉不可相同" };
  }
  if (!input.lines?.length) return { ok: false, error: "請至少加一筆料件" };
  for (const l of input.lines) {
    if (!l.item_id) return { ok: false, error: "明細缺料件" };
    if (!(l.qty_requested > 0)) return { ok: false, error: "明細數量需 > 0" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();

  // 撈料件名
  const itemIds = Array.from(new Set(input.lines.map((l) => l.item_id)));
  const { data: itemRows } = await supabase
    .from("items")
    .select("id, code, name")
    .in("id", itemIds);
  const itemMap = new Map(
    (itemRows ?? []).map((it) => [it.id, { code: it.code, name: it.name }] as const),
  );

  const previewLines: TransferPreviewLine[] = [];
  let qty_total = 0;
  let amount_total = 0;
  let can_post = true;

  for (let i = 0; i < input.lines.length; i++) {
    const l = input.lines[i];
    let stocksQuery = supabase
      .from("stock_items")
      .select("id, qty, bin_id, unit_cost, serial_no, batch_no, created_at")
      .eq("brand_id", scope.brand_id)
      .eq("warehouse_id", input.source_warehouse_id)
      .eq("item_id", l.item_id)
      .eq("status", "available")
      .gt("qty", 0)
      .order("created_at", { ascending: true });
    if (l.source_bin_id) stocksQuery = stocksQuery.eq("bin_id", l.source_bin_id);
    const { data: stocks, error: stockErr } = await stocksQuery;
    if (stockErr) return { ok: false, error: stockErr.message };

    let remaining = l.qty_requested;
    let qty_available = 0;
    const picks: TransferPreviewLine["picks"] = [];
    for (const s of stocks ?? []) {
      qty_available += Number(s.qty);
      if (remaining <= 0) continue;
      const take = Math.min(Number(s.qty), remaining);
      picks.push({
        stock_id: s.id,
        bin_id: s.bin_id,
        bin_label: null,
        qty: take,
        unit_cost: Number(s.unit_cost ?? 0),
        serial_no: s.serial_no,
        batch_no: s.batch_no,
      });
      remaining -= take;
    }

    const shortage = Math.max(0, remaining);
    if (shortage > 0) can_post = false;

    qty_total += l.qty_requested - remaining;
    amount_total += picks.reduce((s, p) => s + p.qty * p.unit_cost, 0);

    previewLines.push({
      line_no: i + 1,
      item_id: l.item_id,
      item_code: itemMap.get(l.item_id)?.code ?? null,
      item_name: itemMap.get(l.item_id)?.name ?? "(unknown)",
      qty_requested: l.qty_requested,
      qty_available,
      shortage,
      picks,
    });
  }

  // bin labels
  const binIds = Array.from(
    new Set(previewLines.flatMap((l) => l.picks.map((p) => p.bin_id)).filter((x): x is string => !!x)),
  );
  if (binIds.length) {
    const { data: bins } = await supabase
      .from("warehouse_bins")
      .select("id, code, name")
      .in("id", binIds);
    const binMap = new Map((bins ?? []).map((b) => [b.id, b.code ?? b.name] as const));
    for (const l of previewLines) {
      for (const p of l.picks) {
        if (p.bin_id) p.bin_label = binMap.get(p.bin_id) ?? null;
      }
    }
  }

  return {
    ok: true,
    data: {
      source_warehouse_id: input.source_warehouse_id,
      target_warehouse_id: input.target_warehouse_id,
      lines: previewLines,
      can_post,
      qty_total: Math.round(qty_total * 100) / 100,
      amount_total: Math.round(amount_total * 100) / 100,
    },
  };
}

const TRANSFER_TYPES_VALID = [
  "inter_store",
  "intra_store",
  "warranty_to_temp",
  "consignment_to_main",
];

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
    line_notes?: string | null;
  }>;
};

export async function createTransfer(
  input: CreateTransferInput,
): Promise<Result<{ id: string; tr_no: string }>> {
  if (!(await hasPermission(PERMISSIONS.TRANSFER_CREATE))) {
    return { ok: false, error: "沒有建立調撥單的權限" };
  }
  if (input.source_warehouse_id === input.target_warehouse_id) {
    return { ok: false, error: "來源倉與目標倉不可相同" };
  }
  const transferType = input.transfer_type ?? "inter_store";
  if (!TRANSFER_TYPES_VALID.includes(transferType)) {
    return { ok: false, error: `不支援的 transfer_type: ${transferType}` };
  }

  // 預檢
  const previewRes = await previewTransfer({
    source_warehouse_id: input.source_warehouse_id,
    target_warehouse_id: input.target_warehouse_id,
    lines: input.lines.map((l) => ({
      item_id: l.item_id,
      qty_requested: l.qty_requested,
      source_bin_id: l.source_bin_id ?? null,
    })),
  });
  if (!previewRes.ok) return previewRes;
  if (!previewRes.data.can_post) {
    return { ok: false, error: "庫存不足，無法出貨（請看預覽紅色提示）" };
  }
  const preview = previewRes.data;

  const supabase = await createClient();
  const scope = await getActiveScope();
  const brandId = scope.brand_id;
  const { data: { user } } = await supabase.auth.getUser();

  // 產 tr_no
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

  const qtyTotal = input.lines.reduce((s, l) => s + l.qty_requested, 0);

  // Insert stock_transfers
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
      shipped_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (trErr) return { ok: false, error: `建立調撥單失敗：${trErr.message}` };

  // Insert stock_transfer_lines（line_no 對齊 preview）
  const linesByLineNo = new Map(preview.lines.map((l) => [l.line_no, l]));
  const inputByLineNo = new Map(input.lines.map((l, i) => [i + 1, l]));
  const linesToInsert = preview.lines.map((pl) => {
    const ipt = inputByLineNo.get(pl.line_no);
    const totalCost = pl.picks.reduce((s, p) => s + p.qty * p.unit_cost, 0);
    const avgCost = pl.qty_requested > 0 ? totalCost / pl.qty_requested : 0;
    return {
      brand_id: brandId,
      tr_id: tr.id,
      line_no: pl.line_no,
      item_id: pl.item_id,
      source_bin_id: pl.picks[0]?.bin_id ?? null,
      target_bin_id: ipt?.target_bin_id ?? null,
      qty_requested: pl.qty_requested,
      qty_shipped: pl.qty_requested,
      qty_received: 0,
      uom: "PCS",
      unit_cost: avgCost,
      notes: ipt?.line_notes ?? null,
    };
  });
  const { data: trLines, error: linesErr } = await supabase
    .from("stock_transfer_lines")
    .insert(linesToInsert)
    .select("id, item_id, line_no, target_bin_id");
  if (linesErr || !trLines) {
    await supabase.from("stock_transfers").delete().eq("id", tr.id);
    return { ok: false, error: `建立調撥明細失敗：${linesErr?.message ?? ""}` };
  }
  const trLineByLineNo = new Map(trLines.map((l) => [l.line_no, l]));

  // 扣源 stock_items + 建目標倉 in_transit
  for (const pl of preview.lines) {
    for (const pick of pl.picks) {
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
    const trLine = trLineByLineNo.get(pl.line_no);
    const inTransitRows = pl.picks.map((p) => ({
      brand_id: brandId,
      item_id: pl.item_id,
      warehouse_id: input.target_warehouse_id,
      bin_id: trLine?.target_bin_id ?? null,
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

  // line_notes（avoid unused-var warning by referencing in linesToInsert above）
  void linesByLineNo;

  revalidatePath("/parts/issue/transfer-out");
  revalidatePath("/parts/receipt/transfer-in");
  revalidatePath("/parts/operations/transfers-in-transit");
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { id: tr.id, tr_no } };
}

/**
 * 取消調撥單：僅 status ∈ {draft, in_transit, partial} 可取消。
 * 邏輯：撈 in_transit stock_items → 翻 available + warehouse_id 改回源倉。
 * 寫 voided_at / voided_by / void_reason（與 voidTransfer 對齊）。
 */
export async function cancelTransfer(
  id: string,
  reason: string,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.TRANSFER_CREATE))) {
    return { ok: false, error: "沒有取消調撥單的權限" };
  }
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "請填寫取消原因" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: tr, error: trErr } = await supabase
    .from("stock_transfers")
    .select("id, tr_no, status, source_warehouse_id")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (trErr) return { ok: false, error: trErr.message };
  if (!tr) return { ok: false, error: "找不到調撥單" };
  if (tr.status === "cancelled") return { ok: false, error: "此調撥單已取消" };
  if (!["draft", "in_transit", "partial"].includes(tr.status)) {
    return {
      ok: false,
      error: `狀態 ${tr.status} 不可取消（已收貨單請至 transfer-in 走作廢）`,
    };
  }

  const { data: trLines } = await supabase
    .from("stock_transfer_lines")
    .select("id")
    .eq("tr_id", id);
  const lineIds = (trLines ?? []).map((l) => l.id);

  // 把 in_transit 庫存搬回源倉、status='available'
  if (lineIds.length > 0) {
    const { data: inTransit } = await supabase
      .from("stock_items")
      .select("id")
      .eq("brand_id", scope.brand_id)
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

  const { data: { user } } = await supabase.auth.getUser();
  const { error: cancelErr } = await supabase
    .from("stock_transfers")
    .update({
      status: "cancelled",
      voided_at: new Date().toISOString(),
      voided_by: user?.id ?? null,
      void_reason: trimmed,
    })
    .eq("id", id);
  if (cancelErr) return { ok: false, error: `取消失敗:${cancelErr.message}` };

  revalidatePath("/parts/issue/transfer-out");
  revalidatePath(`/parts/issue/transfer-out/${id}`);
  revalidatePath("/parts/receipt/transfer-in");
  revalidatePath("/parts/operations/transfers-in-transit");
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { id } };
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
  const { data: gr, error: grErr } = await supabase
    .from("stock_receipts")
    .insert({
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
    })
    .select("id")
    .single();
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

  // 7. 會計事件處理（PARTS_INTERNAL_TRANSFER）
  //   - 同 subsidiary：純庫存內部移動、GAAP 不產 JE、直接 gl_posted=true 收尾
  //   - 跨 subsidiary：需走 INTER_COMPANY_TRANSFER（未實作）、保留 gl_posted=false 等未來補
  const [{ data: srcWh }, { data: tgtWh }] = await Promise.all([
    supabase.from("warehouses").select("org_id").eq("id", tr.source_warehouse_id).maybeSingle(),
    supabase.from("warehouses").select("org_id").eq("id", tr.target_warehouse_id).maybeSingle(),
  ]);
  const [{ data: srcOrg }, { data: tgtOrg }] = await Promise.all([
    srcWh?.org_id
      ? supabase.from("organizations").select("subsidiary_id").eq("id", srcWh.org_id).maybeSingle()
      : Promise.resolve({ data: null }),
    tgtWh?.org_id
      ? supabase.from("organizations").select("subsidiary_id").eq("id", tgtWh.org_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const srcSub = srcOrg?.subsidiary_id ?? null;
  const tgtSub = tgtOrg?.subsidiary_id ?? null;
  const sameSubsidiary = srcSub != null && tgtSub != null && srcSub === tgtSub;
  if (sameSubsidiary) {
    await supabase
      .from("stock_receipts")
      .update({ gl_posted: true, gl_posted_at: new Date().toISOString() })
      .eq("id", gr.id);
    console.log("[accounting] PARTS_INTERNAL_TRANSFER same-subsidiary、skip JE", {
      tr_no: tr.tr_no,
      gr_no,
      subsidiary_id: srcSub,
    });
  } else {
    console.warn("[accounting] PARTS_INTERNAL_TRANSFER cross-subsidiary detected — 需走 INTER_COMPANY_TRANSFER（未實作）", {
      tr_no: tr.tr_no,
      gr_no,
      src_subsidiary: srcSub,
      tgt_subsidiary: tgtSub,
    });
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

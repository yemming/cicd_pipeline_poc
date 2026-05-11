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

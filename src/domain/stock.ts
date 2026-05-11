"use server";

/**
 * Domain Helper — Stock Items（庫存查詢）
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type StockItemRow = Tables["stock_items"]["Row"];

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function mapStockDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23505") return "重複資料：相同序號 / 批號已存在";
  if (error.code === "23503") return "參照的商品或倉庫不存在";
  if (error.code === "23514") return `欄位驗證失敗：${error.message}`;
  return `${fallback}：${error.message}`;
}

export type StockBalanceRow = {
  item_id: string;
  item_code: string;
  item_name: string;
  warehouse_id: string | null;
  warehouse_name: string | null;
  on_hand_qty: number;
  status_breakdown: Record<string, number>;
};

export async function listStockBalance(filter: {
  q?: string;
  warehouse_id?: string;
} = {}): Promise<StockBalanceRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  // 撈 stock_items
  let q = supabase
    .from("stock_items")
    .select("item_id, warehouse_id, qty, status")
    .eq("brand_id", scope.brand_id)
    .limit(2000);
  if (filter.warehouse_id) q = q.eq("warehouse_id", filter.warehouse_id);
  const { data: stocks, error: sErr } = await q;
  if (sErr) throw sErr;
  if (!stocks || stocks.length === 0) return [];

  // group by (item_id, warehouse_id)
  const grouped = new Map<string, { qty: number; statuses: Record<string, number> }>();
  for (const s of stocks) {
    if (!s.item_id) continue;
    const key = `${s.item_id}::${s.warehouse_id ?? ""}`;
    const cur = grouped.get(key) ?? { qty: 0, statuses: {} };
    cur.qty += Number(s.qty ?? 0);
    const st = s.status ?? "on_hand";
    cur.statuses[st] = (cur.statuses[st] ?? 0) + Number(s.qty ?? 0);
    grouped.set(key, cur);
  }

  const itemIds = Array.from(new Set(stocks.map((s) => s.item_id).filter((x): x is string => !!x)));
  const warehouseIds = Array.from(new Set(stocks.map((s) => s.warehouse_id).filter((x): x is string => !!x)));

  const [iRes, wRes] = await Promise.all([
    itemIds.length > 0
      ? supabase.from("items").select("id, code, name").in("id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    warehouseIds.length > 0
      ? supabase.from("warehouses").select("id, name").in("id", warehouseIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (iRes.error) throw iRes.error;
  if (wRes.error) throw wRes.error;
  const iMap = new Map((iRes.data ?? []).map((i) => [i.id, { code: i.code ?? "", name: i.name ?? "" }]));
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  let rows: StockBalanceRow[] = [];
  for (const [key, val] of grouped) {
    const [itemId, whId] = key.split("::");
    const item = iMap.get(itemId);
    rows.push({
      item_id: itemId,
      item_code: item?.code ?? "",
      item_name: item?.name ?? "",
      warehouse_id: whId || null,
      warehouse_name: whId ? wMap.get(whId) ?? null : null,
      on_hand_qty: val.qty,
      status_breakdown: val.statuses,
    });
  }

  if (filter.q) {
    const ql = filter.q.toLowerCase();
    rows = rows.filter(
      (r) => r.item_code.toLowerCase().includes(ql) || r.item_name.toLowerCase().includes(ql),
    );
  }
  rows.sort((a, b) => (a.item_code < b.item_code ? -1 : 1));
  return rows;
}

export async function getStockBalancePageData(filter: {
  q?: string;
} = {}): Promise<{
  rows: StockBalanceRow[];
  canEdit: boolean;
}> {
  const [rows, canEdit] = await Promise.all([
    listStockBalance({ q: filter.q }),
    hasPermission(PERMISSIONS.RECEIPT_VIEW),
  ]);
  return { rows, canEdit };
}

// ──────────────────────────────────────────────────────────────────────────
// 序列號查詢（Phase 2）
// ──────────────────────────────────────────────────────────────────────────

export type SerialTraceEventKind = "receipt" | "transfer_out" | "transfer_in" | "issue";

export type SerialTraceEvent = {
  event_time: string;
  event_type: SerialTraceEventKind;
  doc_no: string | null;
  doc_kind: string;
  warehouse_name: string | null;
  qty: number;
  status_after: string;
};

export type SerialTraceCurrent = {
  warehouse_id: string | null;
  warehouse_name: string | null;
  status: string;
  qty: number;
  last_movement_at: string;
};

export type SerialTraceResult =
  | {
      found: true;
      serial_no: string;
      item: { id: string; code: string; name: string };
      current: SerialTraceCurrent;
      history: SerialTraceEvent[];
    }
  | { found: false; serial_no: string };

/**
 * 用序列號查當前位置 + 異動軌跡。
 *
 * Phase 2 策略（Stage 3 Q2 拍板）：不開新 stock_movements 表，直接從
 *   - stock_items 本身（當前狀態）
 *   - source_receipt_line_id → stock_receipt_lines → stock_receipts（從哪張入庫單來）
 *   - source_transfer_line_id → stock_transfer_lines → stock_transfers（從哪張調撥單來）
 * 拼出最後幾筆軌跡。完整時序 ledger 留 Phase 3。
 */
export async function querySerialNo(serialNo: string): Promise<SerialTraceResult> {
  const trimmed = serialNo.trim();
  if (!trimmed) return { found: false, serial_no: trimmed };

  const supabase = await createClient();
  const scope = await getActiveScope();

  // 同一個 serial_no 在 stock_items 可能有多 row（分批入庫 / 調撥）— 全撈、按 last_movement_at desc
  const { data: items, error } = await supabase
    .from("stock_items")
    .select(
      "id, item_id, warehouse_id, status, qty, last_movement_at, source_receipt_line_id, source_transfer_line_id",
    )
    .eq("brand_id", scope.brand_id)
    .eq("serial_no", trimmed)
    .order("last_movement_at", { ascending: false });
  if (error) throw error;
  if (!items || items.length === 0) return { found: false, serial_no: trimmed };

  const itemIds = Array.from(new Set(items.map((s) => s.item_id).filter((x): x is string => !!x)));
  const warehouseIds = Array.from(
    new Set(items.map((s) => s.warehouse_id).filter((x): x is string => !!x)),
  );
  const receiptLineIds = items
    .map((s) => s.source_receipt_line_id)
    .filter((x): x is string => !!x);
  const transferLineIds = items
    .map((s) => s.source_transfer_line_id)
    .filter((x): x is string => !!x);

  const [itemRes, whRes, recLineRes, trLineRes] = await Promise.all([
    itemIds.length > 0
      ? supabase.from("items").select("id, code, name").in("id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    warehouseIds.length > 0
      ? supabase.from("warehouses").select("id, name").in("id", warehouseIds)
      : Promise.resolve({ data: [], error: null }),
    receiptLineIds.length > 0
      ? supabase
          .from("stock_receipt_lines")
          .select("id, gr_id, created_at")
          .in("id", receiptLineIds)
      : Promise.resolve({ data: [], error: null }),
    transferLineIds.length > 0
      ? supabase
          .from("stock_transfer_lines")
          .select("id, tr_id, created_at")
          .in("id", transferLineIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemRes.error) throw itemRes.error;
  if (whRes.error) throw whRes.error;
  if (recLineRes.error) throw recLineRes.error;
  if (trLineRes.error) throw trLineRes.error;

  const grIds = Array.from(new Set((recLineRes.data ?? []).map((l) => l.gr_id)));
  const trIds = Array.from(new Set((trLineRes.data ?? []).map((l) => l.tr_id)));
  const [recRes, trRes] = await Promise.all([
    grIds.length > 0
      ? supabase
          .from("stock_receipts")
          .select("id, gr_no, type, receipt_date, warehouse_id")
          .in("id", grIds)
      : Promise.resolve({ data: [], error: null }),
    trIds.length > 0
      ? supabase
          .from("stock_transfers")
          .select("id, tr_no, shipped_at, received_at, source_warehouse_id, target_warehouse_id")
          .in("id", trIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (recRes.error) throw recRes.error;
  if (trRes.error) throw trRes.error;

  const iMap = new Map(
    (itemRes.data ?? []).map((i) => [i.id, { code: i.code ?? "", name: i.name ?? "" }]),
  );
  const wMap = new Map((whRes.data ?? []).map((w) => [w.id, w.name ?? ""]));
  const recLineMap = new Map((recLineRes.data ?? []).map((l) => [l.id, l]));
  const trLineMap = new Map((trLineRes.data ?? []).map((l) => [l.id, l]));
  const recMap = new Map((recRes.data ?? []).map((r) => [r.id, r]));
  const trMap = new Map((trRes.data ?? []).map((t) => [t.id, t]));

  const latest = items[0];
  const itemMeta = iMap.get(latest.item_id ?? "");

  const history: SerialTraceEvent[] = [];
  for (const s of items) {
    const wName = s.warehouse_id ? wMap.get(s.warehouse_id) ?? null : null;
    if (s.source_receipt_line_id) {
      const line = recLineMap.get(s.source_receipt_line_id);
      const rec = line ? recMap.get(line.gr_id) : null;
      history.push({
        event_time: rec?.receipt_date ?? line?.created_at ?? s.last_movement_at,
        event_type: "receipt",
        doc_no: rec?.gr_no ?? null,
        doc_kind: rec?.type ?? "入庫",
        warehouse_name: wName,
        qty: Number(s.qty ?? 0),
        status_after: s.status ?? "",
      });
    }
    if (s.source_transfer_line_id) {
      const line = trLineMap.get(s.source_transfer_line_id);
      const tr = line ? trMap.get(line.tr_id) : null;
      history.push({
        event_time: tr?.received_at ?? tr?.shipped_at ?? line?.created_at ?? s.last_movement_at,
        event_type: "transfer_in",
        doc_no: tr?.tr_no ?? null,
        doc_kind: "調撥入庫",
        warehouse_name: wName,
        qty: Number(s.qty ?? 0),
        status_after: s.status ?? "",
      });
    }
    if (s.status === "issued") {
      history.push({
        event_time: s.last_movement_at,
        event_type: "issue",
        doc_no: null,
        doc_kind: "出庫",
        warehouse_name: wName,
        qty: Number(s.qty ?? 0),
        status_after: s.status,
      });
    }
  }
  history.sort((a, b) => (a.event_time < b.event_time ? 1 : -1));

  return {
    found: true,
    serial_no: trimmed,
    item: {
      id: latest.item_id ?? "",
      code: itemMeta?.code ?? "",
      name: itemMeta?.name ?? "",
    },
    current: {
      warehouse_id: latest.warehouse_id ?? null,
      warehouse_name: latest.warehouse_id ? wMap.get(latest.warehouse_id) ?? null : null,
      status: latest.status ?? "",
      qty: Number(latest.qty ?? 0),
      last_movement_at: latest.last_movement_at,
    },
    history,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// 序批號 CRUD（item detail page 的「序批號追蹤」section 用）
//
// ⚠️ 業務語意：stock_items 一般由入庫/調撥/出庫單據流程產出。
// 這組 helper 是給 admin 在商品 detail 直接 CRUD 用、Ming 已拍板（2026-05-11）
// 接受「以後走正式單據時可能跟此處手改 row 對不起來」的 trade-off。
// ──────────────────────────────────────────────────────────────────────────

export type StockItemInput = {
  warehouse_id: string;
  serial_no: string | null;
  batch_no: string | null;
  qty: number;
  status: string;
  unit_cost?: number;
  warranty_start?: string | null;
  warranty_end?: string | null;
  notes?: string | null;
};

function revalidateItemDetail(itemId: string) {
  revalidatePath(`/parts/setup/items/${itemId}`);
}

function validateInput(input: StockItemInput): string | null {
  if (!input.warehouse_id) return "請選擇倉庫";
  if (!input.serial_no && !input.batch_no) return "序列號或批號至少填一個";
  if (!Number.isFinite(input.qty)) return "數量需為數字";
  if (input.qty <= 0) return "數量需大於 0";
  return null;
}

export async function addStockItemForItem(
  itemId: string,
  input: StockItemInput,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);

  const err = validateInput(input);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();
  const scope = await getActiveScope();
  await getCurrentUserAndAdmin();

  const { data, error } = await supabase
    .from("stock_items")
    .insert({
      brand_id: scope.brand_id,
      item_id: itemId,
      warehouse_id: input.warehouse_id,
      serial_no: input.serial_no,
      batch_no: input.batch_no,
      qty: input.qty,
      status: input.status,
      unit_cost: input.unit_cost ?? 0,
      warranty_start: input.warranty_start ?? null,
      warranty_end: input.warranty_end ?? null,
      notes: input.notes ?? null,
      last_movement_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapStockDbError(error, "新增序批號失敗") };

  revalidateItemDetail(itemId);
  return { ok: true, data: { id: data.id } };
}

export async function updateStockItem(
  id: string,
  itemId: string,
  input: StockItemInput,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);

  const err = validateInput(input);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();

  const { error } = await supabase
    .from("stock_items")
    .update({
      warehouse_id: input.warehouse_id,
      serial_no: input.serial_no,
      batch_no: input.batch_no,
      qty: input.qty,
      status: input.status,
      unit_cost: input.unit_cost ?? 0,
      warranty_start: input.warranty_start ?? null,
      warranty_end: input.warranty_end ?? null,
      notes: input.notes ?? null,
      last_movement_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: mapStockDbError(error, "更新序批號失敗") };

  revalidateItemDetail(itemId);
  return { ok: true, data: { id } };
}

export async function deleteStockItem(
  id: string,
  itemId: string,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);

  const supabase = await createClient();
  const { error } = await supabase.from("stock_items").delete().eq("id", id);
  if (error) return { ok: false, error: mapStockDbError(error, "刪除序批號失敗") };

  revalidateItemDetail(itemId);
  return { ok: true, data: { id } };
}

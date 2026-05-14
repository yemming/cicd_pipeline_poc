"use server";

/**
 * Domain Helper — Inventory Adjustments（庫存調整 / 例外進出）
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { instantiateTransaction, TX_TYPES } from "@/domain/transactions";

import type { Database } from "@/lib/database.types";
import { EXCEPTIONS_PAGE_SIZE_DEFAULT } from "./adjustments.constants";

type Tables = Database["public"]["Tables"];
export type InventoryAdjustmentRow = Tables["inventory_adjustments"]["Row"];

export type AdjustmentListRow = InventoryAdjustmentRow & {
  warehouse_name: string | null;
};

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function mapDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23505") return "重複資料：相同單號已存在";
  if (error.code === "23503") return "參照的料件 / 倉庫不存在";
  if (error.code === "23514") return `欄位驗證失敗：${error.message}`;
  return `${fallback}：${error.message}`;
}

export async function listAdjustments(
  filter: {
    type?: string | string[];
    status?: string;
    warehouse_id?: string;
    q?: string;
  } = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: AdjustmentListRow[]; totalCount: number }> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? EXCEPTIONS_PAGE_SIZE_DEFAULT);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("inventory_adjustments")
    .select("*", { count: "exact" })
    .eq("brand_id", scope.brand_id)
    .order("created_at", { ascending: false });
  if (filter.type) {
    if (Array.isArray(filter.type)) {
      if (filter.type.length > 0) q = q.in("type", filter.type);
    } else {
      q = q.eq("type", filter.type);
    }
  }
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.warehouse_id) q = q.eq("warehouse_id", filter.warehouse_id);
  if (filter.q) q = q.ilike("adj_no", `%${filter.q}%`);

  const { data: adjs, error, count } = await q.range(from, to);
  if (error) throw error;
  if (!adjs || adjs.length === 0) return { rows: [], totalCount: count ?? 0 };

  const wIds = Array.from(new Set(adjs.map((a) => a.warehouse_id).filter((x): x is string => !!x)));
  const wRes = wIds.length > 0
    ? await supabase.from("warehouses").select("id, name").in("id", wIds)
    : { data: [], error: null };
  if (wRes.error) throw wRes.error;
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  return {
    rows: adjs.map((a) => ({
      ...a,
      warehouse_name: a.warehouse_id ? wMap.get(a.warehouse_id) ?? null : null,
    })),
    totalCount: count ?? 0,
  };
}

export async function getExceptionsPageData(
  filter: {
    type?: string | string[];
    status?: string;
    warehouse_id?: string;
    q?: string;
  } = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{
  rows: AdjustmentListRow[];
  totalCount: number;
  canEdit: boolean;
  warehouses: Array<{ id: string; code: string | null; name: string }>;
}> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const [aggRes, canEdit, whRes] = await Promise.all([
    listAdjustments(filter, options),
    hasPermission(PERMISSIONS.EXCEPTION_OPS),
    supabase
      .from("warehouses")
      .select("id, code, name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code", { ascending: true }),
  ]);
  if (whRes.error) throw whRes.error;
  return {
    rows: aggRes.rows,
    totalCount: aggRes.totalCount,
    canEdit,
    warehouses: (whRes.data ?? []).map((w) => ({ id: w.id, code: w.code, name: w.name ?? "" })),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Detail / Create / Void
// ──────────────────────────────────────────────────────────────────────────

export type AdjustmentLineRow = {
  id: string;
  line_no: number;
  item_id: string;
  item_code: string;
  item_name: string;
  qty_delta: number;
  unit_cost: number;
  line_amount: number;
  serial_no: string | null;
  batch_no: string | null;
  bin_id: string | null;
  notes: string | null;
};

export type AdjustmentDetail = {
  adj: AdjustmentListRow;
  lines: AdjustmentLineRow[];
};

export async function getAdjustmentById(id: string): Promise<AdjustmentDetail | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: adj, error } = await supabase
    .from("inventory_adjustments")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (error) throw error;
  if (!adj) return null;

  const [linesRes, whRes] = await Promise.all([
    supabase
      .from("inventory_adjustment_lines")
      .select("id, line_no, item_id, qty_delta, unit_cost, line_amount, serial_no, batch_no, bin_id, notes")
      .eq("adj_id", id)
      .order("line_no", { ascending: true }),
    adj.warehouse_id
      ? supabase.from("warehouses").select("id, name").eq("id", adj.warehouse_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (linesRes.error) throw linesRes.error;

  const lineRows = linesRes.data ?? [];
  const itemIds = Array.from(new Set(lineRows.map((l) => l.item_id)));
  const itemsRes = itemIds.length > 0
    ? await supabase.from("items").select("id, code, name").in("id", itemIds)
    : { data: [], error: null };
  if (itemsRes.error) throw itemsRes.error;
  const iMap = new Map(
    (itemsRes.data ?? []).map((i) => [i.id, { code: i.code ?? "", name: i.name ?? "" }]),
  );

  return {
    adj: {
      ...adj,
      warehouse_name: whRes.data?.name ?? null,
    },
    lines: lineRows.map((l) => ({
      id: l.id,
      line_no: l.line_no,
      item_id: l.item_id,
      item_code: iMap.get(l.item_id)?.code ?? "",
      item_name: iMap.get(l.item_id)?.name ?? "",
      qty_delta: Number(l.qty_delta),
      unit_cost: Number(l.unit_cost),
      line_amount: Number(l.line_amount),
      serial_no: l.serial_no,
      batch_no: l.batch_no,
      bin_id: l.bin_id,
      notes: l.notes,
    })),
  };
}

export type NewAdjustmentFormData = {
  warehouses: Array<{ id: string; code: string | null; name: string }>;
  items: Array<{ id: string; code: string; name: string; base_uom: string | null }>;
};

export async function getNewAdjustmentFormData(): Promise<NewAdjustmentFormData> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const [whRes, itRes] = await Promise.all([
    supabase
      .from("warehouses")
      .select("id, code, name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabase
      .from("items")
      .select("id, code, name, base_uom")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code", { ascending: true })
      .limit(2000),
  ]);
  if (whRes.error) throw whRes.error;
  if (itRes.error) throw itRes.error;
  return {
    warehouses: (whRes.data ?? []).map((w) => ({ id: w.id, code: w.code, name: w.name ?? "" })),
    items: (itRes.data ?? []).map((i) => ({
      id: i.id,
      code: i.code ?? "",
      name: i.name ?? "",
      base_uom: i.base_uom ?? null,
    })),
  };
}

export type CreateAdjustmentInput = {
  type: "exception_in" | "exception_out" | "damage" | "manual" | "other" | "loss" | "gain";
  warehouse_id: string;
  reason: string;
  notes?: string | null;
  lines: Array<{
    item_id: string;
    qty_delta: number;            // 正=入庫、負=出庫
    unit_cost: number;
    serial_no?: string | null;
    batch_no?: string | null;
    bin_id?: string | null;
    notes?: string | null;
  }>;
};

async function nextAdjNo(supabase: Awaited<ReturnType<typeof createClient>>, brandId: string): Promise<string> {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const { data: last } = await supabase
    .from("inventory_adjustments")
    .select("adj_no")
    .eq("brand_id", brandId)
    .like("adj_no", `ADJ${dateStr}-%`)
    .order("adj_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (last?.adj_no) {
    const m = last.adj_no.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `ADJ${dateStr}-${String(seq).padStart(3, "0")}`;
}

export async function createAdjustment(
  input: CreateAdjustmentInput,
): Promise<Result<{ id: string; adj_no: string }>> {
  await requirePermission(PERMISSIONS.EXCEPTION_OPS);
  if (!input.warehouse_id) return { ok: false, error: "倉庫必選" };
  if (!input.reason?.trim()) return { ok: false, error: "原因必填" };
  if (!input.lines?.length) return { ok: false, error: "至少需要一筆明細" };
  for (const l of input.lines) {
    if (!l.item_id) return { ok: false, error: "明細料件必選" };
    if (!Number.isFinite(l.qty_delta) || l.qty_delta === 0) {
      return { ok: false, error: "明細數量需為非零數字" };
    }
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  // 預檢出庫足夠
  for (const l of input.lines) {
    if (l.qty_delta >= 0) continue;
    const need = Math.abs(l.qty_delta);
    let q = supabase
      .from("stock_items")
      .select("id, qty")
      .eq("brand_id", scope.brand_id)
      .eq("warehouse_id", input.warehouse_id)
      .eq("item_id", l.item_id)
      .eq("status", "available")
      .gt("qty", 0);
    if (l.serial_no) q = q.eq("serial_no", l.serial_no);
    if (l.batch_no) q = q.eq("batch_no", l.batch_no);
    if (l.bin_id) q = q.eq("bin_id", l.bin_id);
    const { data: avail } = await q;
    const total = (avail ?? []).reduce((s, r) => s + Number(r.qty ?? 0), 0);
    if (total < need) {
      return {
        ok: false,
        error: `料件 ${l.item_id.slice(0, 8)} 庫存不足（有 ${total} 需 ${need}）`,
      };
    }
  }

  const adj_no = await nextAdjNo(supabase, scope.brand_id);
  const totalAmount = input.lines.reduce(
    (s, l) => s + Math.abs(l.qty_delta) * (l.unit_cost ?? 0),
    0,
  );

  const { data: adj, error: adjErr } = await supabase
    .from("inventory_adjustments")
    .insert({
      brand_id: scope.brand_id,
      adj_no,
      type: input.type,
      status: "posted",
      warehouse_id: input.warehouse_id,
      reason: input.reason.trim(),
      notes: input.notes?.trim() || null,
      total_amount: Math.round(totalAmount * 100) / 100,
      posted_at: new Date().toISOString(),
      created_by: userId ?? null,
      approved_at: new Date().toISOString(),
      approved_by: userId ?? null,
      gl_posted: false,
    })
    .select("id, adj_no")
    .single();
  if (adjErr) return { ok: false, error: mapDbError(adjErr, "建調整單失敗") };

  // lines + affect stock_items
  const linePayloads: Array<{
    brand_id: string;
    adj_id: string;
    line_no: number;
    item_id: string;
    qty_delta: number;
    unit_cost: number;
    line_amount: number;
    serial_no: string | null;
    batch_no: string | null;
    bin_id: string | null;
    notes: string | null;
  }> = [];
  let lineNo = 1;
  for (const l of input.lines) {
    const lineAmount = Math.round(Math.abs(l.qty_delta) * (l.unit_cost ?? 0) * 100) / 100;
    linePayloads.push({
      brand_id: scope.brand_id,
      adj_id: adj.id,
      line_no: lineNo++,
      item_id: l.item_id,
      qty_delta: l.qty_delta,
      unit_cost: l.unit_cost,
      line_amount: lineAmount,
      serial_no: l.serial_no ?? null,
      batch_no: l.batch_no ?? null,
      bin_id: l.bin_id ?? null,
      notes: l.notes ?? null,
    });

    if (l.qty_delta > 0) {
      // 入庫：新增 stock_items row
      await supabase.from("stock_items").insert({
        brand_id: scope.brand_id,
        item_id: l.item_id,
        warehouse_id: input.warehouse_id,
        bin_id: l.bin_id ?? null,
        serial_no: l.serial_no ?? null,
        batch_no: l.batch_no ?? null,
        qty: l.qty_delta,
        unit_cost: l.unit_cost,
        status: "available",
        notes: `${adj.adj_no} ${input.reason}`,
        last_movement_at: new Date().toISOString(),
      });
    } else {
      // 出庫：FIFO 扣（指定 serial/batch 優先）
      let remaining = Math.abs(l.qty_delta);
      let stocksQ = supabase
        .from("stock_items")
        .select("id, qty")
        .eq("brand_id", scope.brand_id)
        .eq("warehouse_id", input.warehouse_id)
        .eq("item_id", l.item_id)
        .eq("status", "available")
        .gt("qty", 0);
      if (l.serial_no) stocksQ = stocksQ.eq("serial_no", l.serial_no);
      if (l.batch_no) stocksQ = stocksQ.eq("batch_no", l.batch_no);
      if (l.bin_id) stocksQ = stocksQ.eq("bin_id", l.bin_id);
      const { data: stocks } = await stocksQ.order("created_at", { ascending: true });
      for (const s of stocks ?? []) {
        if (remaining <= 0) break;
        const take = Math.min(Number(s.qty), remaining);
        const newQty = Number(s.qty) - take;
        await supabase
          .from("stock_items")
          .update({
            qty: Math.max(0, Math.round(newQty * 100) / 100),
            last_movement_at: new Date().toISOString(),
            ...(newQty <= 0 ? { status: "issued" } : {}),
          })
          .eq("id", s.id);
        remaining -= take;
      }
    }
  }
  await supabase.from("inventory_adjustment_lines").insert(linePayloads);

  // 會計事件：依 input.type / net qty_delta 方向 map 進 STOCK_ADJUSTMENT_GAIN/LOSS engine
  //   manual 跳過（adjustStockManualAction 走自己的 path）
  //   POC v1：取 lines[0] 代表整單（沿用 PARTS_PURCHASE 慣例）、跨品類精算屬 engine v2
  if (input.type !== "manual" && input.lines.length > 0) {
    const netQtyDelta = input.lines.reduce((s, l) => s + l.qty_delta, 0);
    const direction: "GAIN" | "LOSS" | "SKIP" = (() => {
      if (input.type === "exception_in" || input.type === "gain") return "GAIN";
      if (input.type === "exception_out" || input.type === "damage" || input.type === "loss") return "LOSS";
      // type === 'other' → 看 net 正負
      if (netQtyDelta > 0) return "GAIN";
      if (netQtyDelta < 0) return "LOSS";
      return "SKIP";
    })();
    if (direction !== "SKIP") {
      const txCode = direction === "GAIN" ? TX_TYPES.STOCK_ADJUSTMENT_GAIN : TX_TYPES.STOCK_ADJUSTMENT_LOSS;
      const firstLine = input.lines[0];
      const netAmount = Math.round(totalAmount * 100) / 100;
      const adjNo = adj.adj_no;
      after(async () => {
        const res = await instantiateTransaction(
          txCode,
          {
            item_id: firstLine.item_id,
            warehouse_id: input.warehouse_id,
            net_amount: netAmount,
          },
          { autoPost: true, entryDate: new Date().toISOString().slice(0, 10) },
        );
        if (!res.ok) {
          console.error(`[accounting] ${txCode} 自動過帳失敗`, { adj_no: adjNo, error: res.error });
        } else {
          console.log(`[accounting] ${txCode} 已自動過帳（posted）`, { adj_no: adjNo, journal_entry: res.data });
        }
      });
    }
  }

  revalidatePath("/parts/operations/exceptions");
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { id: adj.id, adj_no: adj.adj_no } };
}

export async function voidAdjustment(
  id: string,
  reason: string,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.EXCEPTION_OPS);
  if (!reason?.trim()) return { ok: false, error: "作廢原因必填" };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  const detail = await getAdjustmentById(id);
  if (!detail) return { ok: false, error: "找不到該調整單" };
  const { adj, lines } = detail;
  if (adj.status === "cancelled") return { ok: false, error: "該單已作廢" };
  if (adj.status !== "posted") return { ok: false, error: "只有已過帳的調整單可作廢" };

  // 反向 stock_items 異動
  for (const l of lines) {
    if (l.qty_delta > 0) {
      // 原本入庫 → 找對應的 stock_items 扣回（用 adj_no 比對 notes 作為 best-effort heuristic）
      const need = l.qty_delta;
      let remaining = need;
      let q = supabase
        .from("stock_items")
        .select("id, qty")
        .eq("brand_id", scope.brand_id)
        .eq("warehouse_id", adj.warehouse_id)
        .eq("item_id", l.item_id)
        .eq("status", "available")
        .ilike("notes", `${adj.adj_no}%`)
        .gt("qty", 0);
      if (l.serial_no) q = q.eq("serial_no", l.serial_no);
      const { data: stocks } = await q;
      for (const s of stocks ?? []) {
        if (remaining <= 0) break;
        const take = Math.min(Number(s.qty), remaining);
        const newQty = Number(s.qty) - take;
        await supabase
          .from("stock_items")
          .update({
            qty: Math.max(0, Math.round(newQty * 100) / 100),
            last_movement_at: new Date().toISOString(),
            ...(newQty <= 0 ? { status: "issued" } : {}),
          })
          .eq("id", s.id);
        remaining -= take;
      }
    } else {
      // 原本出庫 → 補回 stock_items row
      await supabase.from("stock_items").insert({
        brand_id: scope.brand_id,
        item_id: l.item_id,
        warehouse_id: adj.warehouse_id,
        bin_id: l.bin_id ?? null,
        serial_no: l.serial_no ?? null,
        batch_no: l.batch_no ?? null,
        qty: Math.abs(l.qty_delta),
        unit_cost: l.unit_cost,
        status: "available",
        notes: `${adj.adj_no}-void ${reason.trim()}`,
        last_movement_at: new Date().toISOString(),
      });
    }
  }

  const existingNotes = adj.notes ?? "";
  const voidNote = `[作廢 ${new Date().toISOString().slice(0, 10)}] ${reason.trim()}`;
  const { error } = await supabase
    .from("inventory_adjustments")
    .update({
      status: "cancelled",
      notes: existingNotes ? `${existingNotes}\n${voidNote}` : voidNote,
      updated_at: new Date().toISOString(),
      metadata: {
        ...((adj.metadata as Record<string, unknown> | null) ?? {}),
        voided_at: new Date().toISOString(),
        voided_by: userId,
        void_reason: reason.trim(),
      },
    })
    .eq("id", id);
  if (error) return { ok: false, error: mapDbError(error, "作廢失敗") };

  revalidatePath("/parts/operations/exceptions");
  revalidatePath(`/parts/operations/exceptions/${id}`);
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { id } };
}

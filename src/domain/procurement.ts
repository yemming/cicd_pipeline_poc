"use server";

/**
 * Domain Helper — Procurement（採購全域）
 *
 * 涵蓋採購退貨（Phase 1）+ 之後的採購單 / 採購合約 helper 加進同一檔。
 *
 * 架構：POC 階段資料存取慣例（CLAUDE.md / .claude/skills/spec-to-feature/references/architecture.md）
 *   - UI 一律 import 此檔，不准直接 import @/lib/supabase/*
 *   - 此檔內部走 server-side supabase client + getActiveScope
 *   - 寫入動作走 supabase RPC（事務性、原子化），不直連 table
 *   - 提案：docs/proposals/feature-procurement-returns-2026-05-10.md
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type PurchaseReturnRow = Tables["purchase_returns"]["Row"];
export type PurchaseReturnLineRow = Tables["purchase_return_lines"]["Row"];
export type PurchaseOrderRow = Tables["purchase_orders"]["Row"];
export type PurchaseOrderLineRow = Tables["purchase_order_lines"]["Row"];
export type SupplierRow = Tables["suppliers"]["Row"];

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const REVALIDATE_PATHS = ["/parts/purchase/returns"];
function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

function mapDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23505") return "代碼已存在";
  if (error.code === "23503") return "FK 約束失敗（參照的資料不存在）";
  if (error.code === "23514") return `欄位驗證失敗：${error.message}`;
  if (error.code === "P0001") return error.message;
  return `${fallback}：${error.message}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Types
//   常數 RETURN_REASONS / RETURN_STATUSES 已拆到 ./procurement.constants.ts
//   （'use server' module 不能 export 非 async value）
// ──────────────────────────────────────────────────────────────────────────

export type PurchaseReturnListFilter = {
  status?: string;
  vendor_id?: string;
  return_reason?: string;
  date_from?: string;
  date_to?: string;
  q?: string;
};

export type PurchaseReturnRowExpanded = PurchaseReturnRow & {
  vendor?: { id: string; name: string; code: string } | null;
  warehouse?: { id: string; name: string } | null;
  po?: { id: string; po_no: string } | null;
};

export type PurchaseReturnDetail = PurchaseReturnRowExpanded & {
  lines: (PurchaseReturnLineRow & {
    item?: { id: string; code: string; name: string } | null;
    po_line?: { id: string; line_no: number; qty_ordered: number; qty_received: number } | null;
  })[];
};

export type AddPurchaseReturnLineInput = {
  po_line_id: string; // 強制：必須對應 PO line
  item_id: string;
  qty_return: number;
  unit_price: number;
  notes?: string | null;
  selected_serial_nos?: string[];
};

export type AddPurchaseReturnInput = {
  po_id: string; // 強制：Q2 拍板必須綁原採購單
  warehouse_id: string;
  return_reason: string;
  notes?: string | null;
  lines: AddPurchaseReturnLineInput[];
};

export type UpdatePurchaseReturnPatch = {
  return_reason?: string;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

export type PurchaseReturnKpis = {
  pending_count: number;
  shipped_count: number;
  completed_this_month: number;
  amount_this_month: number;
};

export type POOption = {
  id: string;
  po_no: string;
  vendor_id: string;
  vendor_name: string;
  warehouse_id: string;
  po_date: string;
  amount_total: number;
};

export type POLineForReturn = {
  id: string;
  line_no: number;
  item_id: string;
  item_code: string;
  item_name: string;
  uom: string;
  qty_ordered: number;
  qty_received: number;
  qty_returned: number;
  qty_returnable: number; // received - returned
  unit_price: number;
  serial_required: boolean;
  batch_required: boolean;
};

export type VendorOption = {
  id: string;
  code: string;
  name: string;
};

// ──────────────────────────────────────────────────────────────────────────
// Read helpers
// ──────────────────────────────────────────────────────────────────────────

export async function listPurchaseReturns(
  filter: PurchaseReturnListFilter = {},
): Promise<{ rows: PurchaseReturnRowExpanded[]; total: number }> {
  await requirePermission(PERMISSIONS.PO_VIEW);
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("purchase_returns")
    .select(
      `
        *,
        vendor:suppliers!purchase_returns_vendor_id_fkey(id, code, name),
        warehouse:warehouses!purchase_returns_warehouse_id_fkey(id, name),
        po:purchase_orders!purchase_returns_po_id_fkey(id, po_no)
      `,
      { count: "exact" },
    )
    .eq("brand_id", scope.brand_id)
    .order("created_at", { ascending: false });

  if (filter.status) q = q.eq("status", filter.status);
  if (filter.vendor_id) q = q.eq("vendor_id", filter.vendor_id);
  if (filter.return_reason) q = q.eq("return_reason", filter.return_reason);
  if (filter.date_from) q = q.gte("return_date", filter.date_from);
  if (filter.date_to) q = q.lte("return_date", filter.date_to);
  if (filter.q) {
    const t = filter.q.trim();
    if (t) q = q.or(`rt_no.ilike.%${t}%`);
  }

  const { data, error, count } = await q;
  if (error) throw new Error(mapDbError(error, "讀取採購退貨清單失敗"));
  return { rows: (data ?? []) as PurchaseReturnRowExpanded[], total: count ?? 0 };
}

export async function getPurchaseReturnById(
  id: string,
): Promise<PurchaseReturnDetail | null> {
  await requirePermission(PERMISSIONS.PO_VIEW);
  const supabase = await createClient();

  const { data: header, error: e1 } = await supabase
    .from("purchase_returns")
    .select(
      `
        *,
        vendor:suppliers!purchase_returns_vendor_id_fkey(id, code, name),
        warehouse:warehouses!purchase_returns_warehouse_id_fkey(id, name),
        po:purchase_orders!purchase_returns_po_id_fkey(id, po_no)
      `,
    )
    .eq("id", id)
    .maybeSingle();
  if (e1) throw new Error(mapDbError(e1, "讀取退貨單失敗"));
  if (!header) return null;

  const { data: lines, error: e2 } = await supabase
    .from("purchase_return_lines")
    .select(
      `
        *,
        item:items!purchase_return_lines_item_id_fkey(id, code, name),
        po_line:purchase_order_lines!purchase_return_lines_po_line_id_fkey(id, line_no, qty_ordered, qty_received)
      `,
    )
    .eq("rt_id", id)
    .order("line_no", { ascending: true });
  if (e2) throw new Error(mapDbError(e2, "讀取退貨明細失敗"));

  return { ...(header as PurchaseReturnRowExpanded), lines: (lines ?? []) as PurchaseReturnDetail["lines"] };
}

export async function getPurchaseReturnKpis(): Promise<PurchaseReturnKpis> {
  await requirePermission(PERMISSIONS.PO_VIEW);
  const supabase = await createClient();
  const scope = await getActiveScope();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const [pending, shipped, completedThisMonth] = await Promise.all([
    supabase
      .from("purchase_returns")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", scope.brand_id)
      .eq("status", "pending"),
    supabase
      .from("purchase_returns")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", scope.brand_id)
      .eq("status", "shipped"),
    supabase
      .from("purchase_returns")
      .select("id, amount_total", { count: "exact" })
      .eq("brand_id", scope.brand_id)
      .eq("status", "completed")
      .gte("return_date", monthStart),
  ]);

  const amount = (completedThisMonth.data ?? []).reduce(
    (sum, r) => sum + Number(r.amount_total ?? 0),
    0,
  );

  return {
    pending_count: pending.count ?? 0,
    shipped_count: shipped.count ?? 0,
    completed_this_month: completedThisMonth.count ?? 0,
    amount_this_month: amount,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Lookup helpers
// ──────────────────────────────────────────────────────────────────────────

/** 採購單 dropdown：只列「已入庫」(qty_received_total > 0) 的 PO */
export async function listPurchaseOrderOptions(
  filter: { vendor_id?: string } = {},
): Promise<POOption[]> {
  await requirePermission(PERMISSIONS.PO_VIEW);
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("purchase_orders")
    .select(
      `
        id, po_no, vendor_id, warehouse_id, po_date, amount_total, qty_received_total,
        vendor:suppliers!purchase_orders_vendor_id_fkey(id, name)
      `,
    )
    .eq("brand_id", scope.brand_id)
    .gt("qty_received_total", 0)
    .order("po_date", { ascending: false })
    .limit(200);
  if (filter.vendor_id) q = q.eq("vendor_id", filter.vendor_id);

  const { data, error } = await q;
  if (error) throw new Error(mapDbError(error, "讀取採購單選項失敗"));
  return (data ?? []).map((r) => {
    const vendor = Array.isArray(r.vendor) ? r.vendor[0] : r.vendor;
    return {
      id: r.id,
      po_no: r.po_no,
      vendor_id: r.vendor_id,
      vendor_name: vendor?.name ?? "",
      warehouse_id: r.warehouse_id,
      po_date: r.po_date,
      amount_total: Number(r.amount_total ?? 0),
    };
  });
}

/** 撈該 PO 的 lines 給「退貨明細」用，含可退數 (qty_received - qty_returned) */
export async function getPurchaseOrderLinesForReturn(
  po_id: string,
): Promise<POLineForReturn[]> {
  await requirePermission(PERMISSIONS.PO_VIEW);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("purchase_order_lines")
    .select(
      `
        id, line_no, item_id, uom, qty_ordered, qty_received, qty_returned, unit_price,
        serial_required, batch_required,
        item:items!purchase_order_lines_item_id_fkey(id, code, name)
      `,
    )
    .eq("po_id", po_id)
    .order("line_no", { ascending: true });
  if (error) throw new Error(mapDbError(error, "讀取採購單明細失敗"));

  return (data ?? []).map((r) => {
    const item = Array.isArray(r.item) ? r.item[0] : r.item;
    const recv = Number(r.qty_received ?? 0);
    const ret = Number(r.qty_returned ?? 0);
    return {
      id: r.id,
      line_no: r.line_no,
      item_id: r.item_id,
      item_code: item?.code ?? "",
      item_name: item?.name ?? "",
      uom: r.uom ?? "",
      qty_ordered: Number(r.qty_ordered ?? 0),
      qty_received: recv,
      qty_returned: ret,
      qty_returnable: Math.max(0, recv - ret),
      unit_price: Number(r.unit_price ?? 0),
      serial_required: !!r.serial_required,
      batch_required: !!r.batch_required,
    };
  });
}

export async function listVendorOptions(): Promise<VendorOption[]> {
  await requirePermission(PERMISSIONS.PO_VIEW);
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("suppliers")
    .select("id, code, name")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(500);
  if (error) throw new Error(mapDbError(error, "讀取供應商失敗"));
  return (data ?? []) as VendorOption[];
}

// ──────────────────────────────────────────────────────────────────────────
// Write helpers — 全走 RPC
// ──────────────────────────────────────────────────────────────────────────

export async function addPurchaseReturn(
  input: AddPurchaseReturnInput,
): Promise<Result<{ id: string; rt_no: string }>> {
  await requirePermission(PERMISSIONS.PO_RETURN);
  const supabase = await createClient();
  const scope = await getActiveScope();

  // Q2 拍板：強制必須綁 PO
  if (!input.po_id) {
    return { ok: false, error: "退貨必須綁原採購單" };
  }
  if (!input.warehouse_id) {
    return { ok: false, error: "倉庫必填" };
  }
  if (!input.return_reason) {
    return { ok: false, error: "退貨原因必填" };
  }
  if (!input.lines || input.lines.length === 0) {
    return { ok: false, error: "退貨明細不可為空" };
  }
  for (const ln of input.lines) {
    if (!ln.po_line_id) return { ok: false, error: "每筆退貨明細必須對應 PO line" };
    if (!ln.item_id) return { ok: false, error: "每筆退貨明細必須有商品" };
    if (!(ln.qty_return > 0)) return { ok: false, error: "退貨數量必須大於 0" };
  }

  const { data, error } = await supabase.rpc("procurement_create_return", {
    p_brand_id: scope.brand_id,
    p_po_id: input.po_id,
    p_warehouse_id: input.warehouse_id,
    p_return_reason: input.return_reason,
    p_notes: input.notes ?? null,
    p_lines: input.lines.map((ln) => ({
      po_line_id: ln.po_line_id,
      item_id: ln.item_id,
      qty_return: ln.qty_return,
      unit_price: ln.unit_price,
      notes: ln.notes ?? null,
      selected_serial_nos: ln.selected_serial_nos ?? [],
    })),
  });
  if (error) return { ok: false, error: mapDbError(error, "建立退貨單失敗") };
  const row = data as PurchaseReturnRow;
  revalidateAll();
  return { ok: true, data: { id: row.id, rt_no: row.rt_no } };
}

export async function updatePurchaseReturn(
  id: string,
  patch: UpdatePurchaseReturnPatch,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.PO_RETURN);
  const supabase = await createClient();

  // 只允許 pending 改基本欄位（line 變動不在 Phase 1 範圍）
  const { data: current, error: e0 } = await supabase
    .from("purchase_returns")
    .select("status, metadata")
    .eq("id", id)
    .maybeSingle();
  if (e0) return { ok: false, error: mapDbError(e0, "讀取退貨單失敗") };
  if (!current) return { ok: false, error: "退貨單不存在" };
  if (current.status !== "pending") {
    return { ok: false, error: `只能編輯 pending 退貨單（目前狀態=${current.status}）` };
  }

  const updates: Record<string, unknown> = {};
  if (patch.return_reason !== undefined) updates.return_reason = patch.return_reason;
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (patch.metadata !== undefined) {
    const merged = {
      ...((current.metadata ?? {}) as Record<string, unknown>),
      ...patch.metadata,
    };
    updates.metadata = merged;
  }
  if (Object.keys(updates).length === 0) return { ok: true, data: { id } };

  const { error } = await supabase.from("purchase_returns").update(updates).eq("id", id);
  if (error) return { ok: false, error: mapDbError(error, "更新退貨單失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

export async function approvePurchaseReturn(id: string): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.PO_APPROVE);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("procurement_approve_return", { p_rt_id: id });
  if (error) return { ok: false, error: mapDbError(error, "審核退貨單失敗") };
  revalidateAll();
  return { ok: true, data: { id: (data as PurchaseReturnRow).id } };
}

export async function shipPurchaseReturn(
  id: string,
  input: { logistics_provider: string; logistics_tracking_no: string },
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.PO_RETURN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("procurement_ship_return", {
    p_rt_id: id,
    p_provider: input.logistics_provider,
    p_tracking_no: input.logistics_tracking_no,
  });
  if (error) return { ok: false, error: mapDbError(error, "填物流失敗") };
  revalidateAll();
  return { ok: true, data: { id: (data as PurchaseReturnRow).id } };
}

export async function completePurchaseReturn(
  id: string,
  input?: { refund_amount?: number },
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.PO_RETURN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("procurement_complete_return", {
    p_rt_id: id,
    p_refund_amount: input?.refund_amount ?? undefined,
  });
  if (error) return { ok: false, error: mapDbError(error, "標完成失敗") };
  revalidateAll();
  return { ok: true, data: { id: (data as PurchaseReturnRow).id } };
}

export async function cancelPurchaseReturn(
  id: string,
  reason: string,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.PO_RETURN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("procurement_cancel_return", {
    p_rt_id: id,
    p_reason: reason,
  });
  if (error) return { ok: false, error: mapDbError(error, "作廢退貨單失敗") };
  revalidateAll();
  return { ok: true, data: { id: (data as PurchaseReturnRow).id } };
}

export async function deletePurchaseReturn(id: string): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.PO_RETURN);
  const supabase = await createClient();

  const { data: current, error: e0 } = await supabase
    .from("purchase_returns")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (e0) return { ok: false, error: mapDbError(e0, "讀取退貨單失敗") };
  if (!current) return { ok: false, error: "退貨單不存在" };
  if (current.status !== "pending") {
    return {
      ok: false,
      error: `只能刪除 pending 退貨單（其他狀態請走作廢流程；目前狀態=${current.status}）`,
    };
  }

  const { error } = await supabase.from("purchase_returns").delete().eq("id", id);
  if (error) return { ok: false, error: mapDbError(error, "刪除退貨單失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

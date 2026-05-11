"use server";

/**
 * Domain Helper — Purchase Orders（商品採購單）
 *
 * Read：listPurchaseOrders / getOrdersPageData
 * Mutations：createPurchaseOrder / approvePurchaseOrder / cancelPurchaseOrder
 *   （從 src/lib/parts/actions/index.ts 遷入；Result<T> 沿用 domain 慣例）
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
export type PurchaseOrderRow = Tables["purchase_orders"]["Row"];

export type PurchaseOrderListRow = PurchaseOrderRow & {
  vendor_name: string | null;
  warehouse_name: string | null;
};

const TAX_RATE = 0.05;

export async function listPurchaseOrders(filter: {
  status?: string;
  q?: string;
} = {}): Promise<PurchaseOrderListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("purchase_orders")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("po_date", { ascending: false })
    .limit(200);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.q) q = q.ilike("po_no", `%${filter.q}%`);

  const { data: pos, error } = await q;
  if (error) throw error;
  if (!pos || pos.length === 0) return [];

  const vendorIds = Array.from(new Set(pos.map((p) => p.vendor_id).filter((x): x is string => !!x)));
  const warehouseIds = Array.from(new Set(pos.map((p) => p.warehouse_id).filter((x): x is string => !!x)));

  const [vRes, wRes] = await Promise.all([
    vendorIds.length > 0
      ? supabase.from("suppliers").select("id, name").in("id", vendorIds)
      : Promise.resolve({ data: [], error: null }),
    warehouseIds.length > 0
      ? supabase.from("warehouses").select("id, name").in("id", warehouseIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (vRes.error) throw vRes.error;
  if (wRes.error) throw wRes.error;

  const vMap = new Map((vRes.data ?? []).map((v) => [v.id, v.name]));
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  return pos.map((p) => ({
    ...p,
    vendor_name: p.vendor_id ? vMap.get(p.vendor_id) ?? null : null,
    warehouse_name: p.warehouse_id ? wMap.get(p.warehouse_id) ?? null : null,
  }));
}

export async function getOrdersPageData(filter: {
  status?: string;
  q?: string;
} = {}): Promise<{
  rows: PurchaseOrderListRow[];
  canEdit: boolean;
}> {
  const [rows, canEdit] = await Promise.all([
    listPurchaseOrders(filter),
    hasPermission(PERMISSIONS.PO_CREATE),
  ]);
  return { rows, canEdit };
}

// ─────────────────────────────────────────────────────────────
// Mutations — create / approve / cancel
// （從 src/lib/parts/actions/index.ts 遷入，邏輯 1:1，僅將 ActionResult 改為 domain Result）
// ─────────────────────────────────────────────────────────────

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

/** 建立 PO（pending 狀態）+ lines + 自動產號 */
export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
): Promise<Result<{ id: string; po_no: string }>> {
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

  // 2. 計算金額（每行 pretax + 5% tax）
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
): Promise<Result<null>> {
  if (!poId) return { ok: false, error: "缺 poId" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

/** PO 取消：任何狀態 → cancelled（只有未入庫才能取消） */
export async function cancelPurchaseOrder(
  poId: string,
): Promise<Result<null>> {
  if (!poId) return { ok: false, error: "缺 poId" };
  const supabase = await createClient();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("qty_received_total")
    .eq("id", poId)
    .single();
  if (po && (po.qty_received_total ?? 0) > 0) {
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

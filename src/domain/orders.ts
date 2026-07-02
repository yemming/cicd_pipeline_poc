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
import { getBrandConfig } from "@/domain/brand-config";

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
  kpis: PurchaseOrderKpis;
}> {
  const [rows, canEdit, kpis] = await Promise.all([
    listPurchaseOrders(filter),
    hasPermission(PERMISSIONS.PO_CREATE),
    getPurchaseOrderKpis(),
  ]);
  return { rows, canEdit, kpis };
}

// ─────────────────────────────────────────────────────────────
// KPI — 給 board.tsx 頂部 KpiCard 列用
// ─────────────────────────────────────────────────────────────

export type PurchaseOrderKpis = {
  newThisMonth: number;        // 本月新增（po_date 落在本月）
  pendingApproval: number;     // 草稿/待審核（status = draft）
  inTransit: number;           // 在途（approved 或 partial，尚未 closed）
  receivedThisMonth: number;   // 本月已收貨（closed 且 closed_at 落在本月）
  overdue: number;             // 逾期（approved/partial 且 eta_date < 今天）
};

export async function getPurchaseOrderKpis(): Promise<PurchaseOrderKpis> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const [newRes, pendRes, inTransitRes, receivedRes, overdueRes] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", scope.brand_id)
      .gte("po_date", firstOfMonth),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", scope.brand_id)
      .eq("status", "draft"),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", scope.brand_id)
      .in("status", ["approved", "partial"]),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", scope.brand_id)
      .eq("status", "closed")
      .gte("closed_at", firstOfMonth),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", scope.brand_id)
      .in("status", ["approved", "partial"])
      .lt("eta_date", todayStr),
  ]);

  return {
    newThisMonth: newRes.count ?? 0,
    pendingApproval: pendRes.count ?? 0,
    inTransit: inTransitRes.count ?? 0,
    receivedThisMonth: receivedRes.count ?? 0,
    overdue: overdueRes.count ?? 0,
  };
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
      status: "draft",
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

/** PO 審核：draft → approved */
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
    .eq("status", "draft");
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
  revalidatePath(`/parts/purchase/orders/${poId}`);
  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────
// Detail / Update
// ─────────────────────────────────────────────────────────────

export type PurchaseOrderDetailLine = {
  id: string;
  line_no: number;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  item_uom: string | null;
  qty_ordered: number;
  qty_received: number;
  qty_returned: number;
  unit_price: number;
  tax_rate: number;
  line_amount_pretax: number;
  line_amount_tax: number;
  line_amount_total: number;
  notes: string | null;
};

export type PurchaseOrderReceiptRef = {
  id: string;
  gr_no: string;
  receipt_date: string | null;
  qty_received_total: number;
  amount_total: number;
  status: string;
};

export type PurchaseOrderDetail = PurchaseOrderRow & {
  vendor_name: string | null;
  vendor_code: string | null;
  warehouse_name: string | null;
  warehouse_code: string | null;
  created_by_name: string | null;
  approved_by_name: string | null;
  source_req_no: string | null;
  lines: PurchaseOrderDetailLine[];
  receipts: PurchaseOrderReceiptRef[];
};

export async function getPurchaseOrderById(
  id: string,
): Promise<PurchaseOrderDetail | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: po, error } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (error) throw error;
  if (!po) return null;

  const [vRes, wRes, creatorRes, approverRes, reqRes] = await Promise.all([
    po.vendor_id
      ? supabase.from("suppliers").select("name, code").eq("id", po.vendor_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    po.warehouse_id
      ? supabase.from("warehouses").select("name, code").eq("id", po.warehouse_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    po.created_by
      ? supabase.from("profiles").select("display_name").eq("id", po.created_by).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    po.approved_by
      ? supabase.from("profiles").select("display_name").eq("id", po.approved_by).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    po.source_req_id
      ? supabase.from("purchase_requisitions").select("req_no").eq("id", po.source_req_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
  ]);

  const { data: rawLines, error: lineErr } = await supabase
    .from("purchase_order_lines")
    .select(
      "id, line_no, item_id, qty_ordered, qty_received, qty_returned, unit_price, tax_rate, line_amount_pretax, line_amount_tax, line_amount_total, uom, notes",
    )
    .eq("po_id", id)
    .order("line_no", { ascending: true });
  if (lineErr) throw lineErr;

  const itemIds = Array.from(new Set((rawLines ?? []).map((l) => l.item_id)));
  const itemsRes = itemIds.length
    ? await supabase.from("items").select("id, code, name, base_uom").in("id", itemIds)
    : { data: [], error: null };
  const itemMap = new Map(
    (itemsRes.data ?? []).map((it) => [it.id, { code: it.code, name: it.name, base_uom: it.base_uom }]),
  );

  const lines: PurchaseOrderDetailLine[] = (rawLines ?? []).map((l) => ({
    id: l.id,
    line_no: l.line_no,
    item_id: l.item_id,
    item_code: itemMap.get(l.item_id)?.code ?? null,
    item_name: itemMap.get(l.item_id)?.name ?? null,
    item_uom: l.uom ?? itemMap.get(l.item_id)?.base_uom ?? null,
    qty_ordered: Number(l.qty_ordered ?? 0),
    qty_received: Number(l.qty_received ?? 0),
    qty_returned: Number(l.qty_returned ?? 0),
    unit_price: Number(l.unit_price ?? 0),
    tax_rate: Number(l.tax_rate ?? 0),
    line_amount_pretax: Number(l.line_amount_pretax ?? 0),
    line_amount_tax: Number(l.line_amount_tax ?? 0),
    line_amount_total: Number(l.line_amount_total ?? 0),
    notes: l.notes,
  }));

  const { data: rawReceipts } = await supabase
    .from("stock_receipts")
    .select("id, gr_no, receipt_date, qty_received_total, amount_total, status")
    .eq("source_doc_id", id)
    .eq("source_doc_type", "purchase_order")
    .order("receipt_date", { ascending: false });

  const receipts: PurchaseOrderReceiptRef[] = (rawReceipts ?? []).map((r) => ({
    id: r.id,
    gr_no: r.gr_no,
    receipt_date: r.receipt_date,
    qty_received_total: Number(r.qty_received_total ?? 0),
    amount_total: Number(r.amount_total ?? 0),
    status: r.status,
  }));

  return {
    ...po,
    vendor_name: vRes.data?.name ?? null,
    vendor_code: vRes.data?.code ?? null,
    warehouse_name: wRes.data?.name ?? null,
    warehouse_code: wRes.data?.code ?? null,
    created_by_name: creatorRes.data?.display_name ?? null,
    approved_by_name: approverRes.data?.display_name ?? null,
    source_req_no: reqRes.data?.req_no ?? null,
    lines,
    receipts,
  };
}

// ─────────────────────────────────────────────────────────────
// 列印 — getPurchaseOrderForPrint(id)
//
// 跟 detail 不同：除了單頭 + 明細，還要撈
//   - subsidiary（買方法人 letterhead）
//   - supplier 全資料（電話 / 地址 / 統編 / 付款條件）
//   - warehouse 地址（收貨地）
// 一支 helper 一次撈乾淨，print page 不要自己拼 query。
// ─────────────────────────────────────────────────────────────

export type PurchaseOrderForPrint = {
  /** 原 purchase_orders.id (uuid)，給 /api/pdf/purchase-order/{id} 用 */
  id: string;
  // 買方（公司 letterhead）
  buyer: {
    legalName: string;
    taxId: string | null;
    address: string | null;
    phone: string | null;
    responsible: string | null;
  };
  brand: { key: string; displayName: string };

  // 賣方（供應商）
  vendor: {
    code: string | null;
    name: string;
    contact: string | null;
    phone: string | null;
    address: string | null;
    taxId: string | null;
    paymentTerms: string | null;
  };

  // 收貨地（倉庫）
  shipTo: {
    name: string | null;
    address: string | null;
  };

  // 單頭
  poNo: string;
  poDate: string | null;
  etaDate: string | null;
  currency: string | null;
  exchangeRate: number;
  status: string;
  purchaseType: string | null;
  sourceReqNo: string | null;
  notes: string | null;
  createdByName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;

  // 明細
  lines: Array<{
    lineNo: number;
    itemCode: string | null;
    itemName: string;
    uom: string | null;
    qty: number;
    unitPrice: number;
    pretax: number;
    tax: number;
    total: number;
    notes: string | null;
  }>;

  // 總計
  amountPretax: number;
  amountTax: number;
  amountTotal: number;
};

export async function getPurchaseOrderForPrint(
  id: string,
): Promise<PurchaseOrderForPrint | null> {
  // reuse detail fetcher（已有單頭 + 明細 + 倉庫名 + 供應商基本資訊）
  const detail = await getPurchaseOrderById(id);
  if (!detail) return null;

  const supabase = await createClient();
  const scope = await getActiveScope();
  const brandCfg = await getBrandConfig(scope.brand_id);
  const brandName = brandCfg.brandName ?? scope.brand_id;

  // 補撈：subsidiary 法人資訊 + supplier 完整聯絡資訊 + warehouse 地址

  const [subsRes, supRes, whRes] = await Promise.all([
    supabase
      .from("subsidiaries")
      .select("legal_name, tax_id, address, phone, responsible_person")
      .eq("id", scope.subsidiary_id)
      .maybeSingle(),
    detail.vendor_id
      ? supabase
          .from("suppliers")
          .select("code, name, primary_contact, phone, address, tax_id, payment_terms")
          .eq("id", detail.vendor_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as const),
    detail.warehouse_id
      ? supabase
          .from("warehouses")
          .select("name, address")
          .eq("id", detail.warehouse_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as const),
  ]);

  return {
    id: detail.id,
    buyer: {
      legalName: subsRes.data?.legal_name ?? "—",
      taxId: subsRes.data?.tax_id ?? null,
      address: subsRes.data?.address ?? null,
      phone: subsRes.data?.phone ?? null,
      responsible: subsRes.data?.responsible_person ?? null,
    },
    brand: {
      key: scope.brand_id,
      displayName: brandName,
    },
    vendor: {
      code: supRes.data?.code ?? detail.vendor_code,
      name: supRes.data?.name ?? detail.vendor_name ?? "—",
      contact: supRes.data?.primary_contact ?? null,
      phone: supRes.data?.phone ?? null,
      address: supRes.data?.address ?? null,
      taxId: supRes.data?.tax_id ?? null,
      paymentTerms: supRes.data?.payment_terms ?? null,
    },
    shipTo: {
      name: whRes.data?.name ?? detail.warehouse_name,
      address: whRes.data?.address ?? null,
    },
    poNo: detail.po_no,
    poDate: detail.po_date,
    etaDate: detail.eta_date,
    currency: detail.currency,
    exchangeRate: Number(detail.exchange_rate ?? 1),
    status: detail.status,
    purchaseType: detail.purchase_type,
    sourceReqNo: detail.source_req_no,
    notes: detail.notes,
    createdByName: detail.created_by_name,
    approvedByName: detail.approved_by_name,
    approvedAt: detail.approved_at,
    lines: detail.lines.map((l) => ({
      lineNo: l.line_no,
      itemCode: l.item_code,
      itemName: l.item_name ?? "—",
      uom: l.item_uom,
      qty: l.qty_ordered,
      unitPrice: l.unit_price,
      pretax: l.line_amount_pretax,
      tax: l.line_amount_tax,
      total: l.line_amount_total,
      notes: l.notes,
    })),
    amountPretax: Number(detail.amount_pretax ?? 0),
    amountTax: Number(detail.amount_tax ?? 0),
    amountTotal: Number(detail.amount_total ?? 0),
  };
}

// 建單表單需要的下拉資料
export type NewPOFormPick = { id: string; code: string; name: string };
export type NewPOFormItemPick = NewPOFormPick & { base_uom: string | null };

export async function getNewPOFormData(): Promise<{
  suppliers: NewPOFormPick[];
  warehouses: NewPOFormPick[];
  items: NewPOFormItemPick[];
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const [supRes, whRes, itemRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("warehouses")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("items")
      .select("id, code, name, base_uom")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code")
      .limit(500),
  ]);
  return {
    suppliers: (supRes.data ?? []) as NewPOFormPick[],
    warehouses: (whRes.data ?? []) as NewPOFormPick[],
    items: (itemRes.data ?? []) as NewPOFormItemPick[],
  };
}

export type UpdatePurchaseOrderInput = {
  notes?: string | null;
  eta_date?: string | null;
  purchase_type?: string;
  line_notes?: Array<{ id: string; notes: string | null }>;
};

/**
 * 更新採購單 — 受限欄位：notes / eta_date / purchase_type / line notes
 * received / cancelled 狀態不可改
 */
export async function updatePurchaseOrder(
  id: string,
  patch: UpdatePurchaseOrderInput,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: current, error: curErr } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (curErr) return { ok: false, error: curErr.message };
  if (!current) return { ok: false, error: "找不到採購單" };
  if (["cancelled", "closed", "received"].includes(current.status)) {
    return { ok: false, error: `狀態 ${current.status} 不可修改` };
  }

  const headerPatch: Record<string, unknown> = {};
  if (patch.notes !== undefined) headerPatch.notes = patch.notes;
  if (patch.eta_date !== undefined) headerPatch.eta_date = patch.eta_date;
  if (patch.purchase_type !== undefined) headerPatch.purchase_type = patch.purchase_type;

  if (Object.keys(headerPatch).length > 0) {
    const { error: upErr } = await supabase
      .from("purchase_orders")
      .update(headerPatch)
      .eq("id", id);
    if (upErr) return { ok: false, error: upErr.message };
  }

  if (patch.line_notes && patch.line_notes.length > 0) {
    for (const ln of patch.line_notes) {
      const { error: lnErr } = await supabase
        .from("purchase_order_lines")
        .update({ notes: ln.notes })
        .eq("id", ln.id)
        .eq("po_id", id);
      if (lnErr) return { ok: false, error: `明細備註更新失敗:${lnErr.message}` };
    }
  }

  revalidatePath("/parts/purchase/orders");
  revalidatePath(`/parts/purchase/orders/${id}`);
  return { ok: true, data: { id } };
}

"use server";

/**
 * Domain Helper — Stock Issues（出庫單）
 *
 * §6.1 維修領料（RO 一鍵 / ad-hoc 手動）
 *  - listIssues / getIssuesPageData：list 共用，filter type/status/q/warehouse_id
 *  - getIssueById：detail（含 lines + warehouse/customer/wo joins）
 *  - getRepairPickFormData：/new 頁初始化（warehouses + openWorkOrders + items）
 *  - previewRepairPick：FIFO 配置預覽（RO 或 ad-hoc 兩 mode）
 *  - pickForWorkOrder：RO 一鍵領料（建單 + lines + 扣 stock_items）
 *  - pickAdHoc：手動領料（不綁 RO）
 *  - updateIssue：限定欄位編輯（notes / line.notes）
 *  - voidIssue：作廢（守門 status='completed'、還原 stock_items、寫 voided_*）
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { instantiateTransaction, TX_TYPES } from "@/domain/transactions";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type StockIssueRow = Tables["stock_issues"]["Row"];

export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// List
// ─────────────────────────────────────────────────────────────

export type StockIssueListRow = StockIssueRow & {
  warehouse_name: string | null;
  customer_name: string | null;
  ro_no: string | null;
};

export async function listIssues(filter: {
  type?: string;
  status?: string;
  q?: string;
  warehouse_id?: string;
} = {}): Promise<StockIssueListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("stock_issues")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter.type) q = q.eq("type", filter.type);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.warehouse_id) q = q.eq("warehouse_id", filter.warehouse_id);
  if (filter.q) q = q.ilike("gi_no", `%${filter.q}%`);

  const { data: rs, error } = await q;
  if (error) throw error;
  if (!rs || rs.length === 0) return [];

  const wIds = Array.from(new Set(rs.map((r) => r.warehouse_id).filter((x): x is string => !!x)));
  const cIds = Array.from(new Set(rs.map((r) => r.customer_id).filter((x): x is string => !!x)));
  const woIds = Array.from(new Set(rs.map((r) => r.ro_id).filter((x): x is string => !!x)));
  // C-28 加購領料：ro_id 刻意留 null、出處記在 source_doc_id（repair_orders.id）。
  // 這類單沒有 work_orders 可解單號，改從 repair_orders.ro_code 取。
  const roIds = Array.from(
    new Set(
      rs
        .filter((r) => !r.ro_id && r.source_doc_type === "repair_order" && r.source_doc_id)
        .map((r) => r.source_doc_id as string),
    ),
  );

  const [wRes, cRes, woRes, roRes] = await Promise.all([
    wIds.length > 0
      ? supabase.from("warehouses").select("id, name").in("id", wIds)
      : Promise.resolve({ data: [], error: null } as const),
    cIds.length > 0
      ? supabase.from("customers").select("id, name").in("id", cIds)
      : Promise.resolve({ data: [], error: null } as const),
    woIds.length > 0
      ? supabase.from("work_orders").select("id, ro_no").in("id", woIds)
      : Promise.resolve({ data: [], error: null } as const),
    roIds.length > 0
      ? supabase.from("repair_orders").select("id, ro_code").in("id", roIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name] as const));
  const cMap = new Map((cRes.data ?? []).map((c) => [c.id, c.name] as const));
  const woMap = new Map((woRes.data ?? []).map((w) => [w.id, w.ro_no] as const));
  const roMap = new Map((roRes.data ?? []).map((r) => [r.id, r.ro_code] as const));

  return rs.map((r) => ({
    ...r,
    warehouse_name: r.warehouse_id ? wMap.get(r.warehouse_id) ?? null : null,
    customer_name: r.customer_id ? cMap.get(r.customer_id) ?? null : null,
    ro_no: r.ro_id
      ? woMap.get(r.ro_id) ?? null
      : r.source_doc_type === "repair_order" && r.source_doc_id
        ? roMap.get(r.source_doc_id) ?? null
        : null,
  }));
}

export async function getIssuesPageData(filter: {
  type?: string;
  status?: string;
  q?: string;
  warehouse_id?: string;
} = {}): Promise<{
  rows: StockIssueListRow[];
  canEdit: boolean;
  warehouses: Array<{ id: string; code: string | null; name: string }>;
}> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const [rows, canEdit, whRes] = await Promise.all([
    listIssues(filter),
    hasPermission(PERMISSIONS.ISSUE_CREATE),
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

// ─────────────────────────────────────────────────────────────
// Detail
// ─────────────────────────────────────────────────────────────

export type StockIssueDetailLine = {
  id: string;
  line_no: number;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  bin_id: string | null;
  bin_label: string | null;
  qty_issued: number;
  uom: string;
  unit_cost: number | null;
  unit_price: number | null;
  line_amount: number | null;
  serial_no: string | null;
  batch_no: string | null;
  notes: string | null;
  /** 是否為保固件（來自 work_order_items.is_warranty）；無 RO 工單時恆為 false */
  is_warranty: boolean;
};

export type StockIssueDetail = StockIssueRow & {
  warehouse_name: string | null;
  warehouse_code: string | null;
  customer_name: string | null;
  ro_no: string | null;
  posted_by_name: string | null;
  voided_by_name: string | null;
  lines: StockIssueDetailLine[];
};

export async function getIssueById(id: string): Promise<StockIssueDetail | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: row, error } = await supabase
    .from("stock_issues")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const [wRes, cRes, woRes, postedByRes, voidedByRes] = await Promise.all([
    row.warehouse_id
      ? supabase.from("warehouses").select("name, code").eq("id", row.warehouse_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    row.customer_id
      ? supabase.from("customers").select("name").eq("id", row.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    row.ro_id
      ? supabase.from("work_orders").select("ro_no").eq("id", row.ro_id).maybeSingle()
      : row.source_doc_type === "repair_order" && row.source_doc_id
        ? // C-28 加購領料：ro_id 為 null，單號改從 repair_orders.ro_code 取
          supabase
            .from("repair_orders")
            .select("ro_no:ro_code")
            .eq("id", row.source_doc_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as const),
    row.posted_by
      ? supabase.from("profiles").select("display_name").eq("id", row.posted_by).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    row.voided_by
      ? supabase.from("profiles").select("display_name").eq("id", row.voided_by).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
  ]);

  const { data: rawLines, error: lineErr } = await supabase
    .from("stock_issue_lines")
    .select(
      "id, line_no, item_id, bin_id, qty_issued, uom, unit_cost, unit_price, line_amount, serial_no, batch_no, notes",
    )
    .eq("gi_id", id)
    .order("line_no", { ascending: true });
  if (lineErr) throw lineErr;

  const itemIds = Array.from(new Set((rawLines ?? []).map((l) => l.item_id)));
  const binIds = Array.from(new Set((rawLines ?? []).map((l) => l.bin_id).filter((x): x is string => !!x)));

  const [itemsRes, binsRes, warrantyRes] = await Promise.all([
    itemIds.length
      ? supabase.from("items").select("id, code, name").in("id", itemIds)
      : Promise.resolve({ data: [], error: null } as const),
    binIds.length
      ? supabase.from("warehouse_bins").select("id, code, name").in("id", binIds)
      : Promise.resolve({ data: [], error: null } as const),
    // 查 RO 工單的保固料件清單（有 ro_id 才查）
    row.ro_id
      ? supabase
          .from("work_order_items")
          .select("item_id")
          .eq("work_order_id", row.ro_id)
          .eq("is_warranty", true)
          .eq("kind", "parts")
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  const itemMap = new Map(
    (itemsRes.data ?? []).map((it) => [it.id, { code: it.code, name: it.name }] as const),
  );
  const binMap = new Map(
    (binsRes.data ?? []).map((b) => [b.id, b.code ?? b.name] as const),
  );
  // 保固料件 item_id 集合（用於逐行標記）
  const warrantyItemIds = new Set(
    (warrantyRes.data ?? []).map((w) => w.item_id),
  );

  const lines: StockIssueDetailLine[] = (rawLines ?? []).map((l) => ({
    id: l.id,
    line_no: l.line_no,
    item_id: l.item_id,
    item_code: itemMap.get(l.item_id)?.code ?? null,
    item_name: itemMap.get(l.item_id)?.name ?? null,
    bin_id: l.bin_id,
    bin_label: l.bin_id ? binMap.get(l.bin_id) ?? null : null,
    qty_issued: Number(l.qty_issued ?? 0),
    uom: l.uom,
    unit_cost: l.unit_cost === null ? null : Number(l.unit_cost),
    unit_price: l.unit_price === null ? null : Number(l.unit_price),
    line_amount: l.line_amount === null ? null : Number(l.line_amount),
    serial_no: l.serial_no,
    batch_no: l.batch_no,
    notes: l.notes,
    is_warranty: warrantyItemIds.has(l.item_id),
  }));

  return {
    ...row,
    warehouse_name: wRes.data?.name ?? null,
    warehouse_code: wRes.data?.code ?? null,
    customer_name: cRes.data?.name ?? null,
    ro_no: woRes.data?.ro_no ?? null,
    posted_by_name: postedByRes.data?.display_name ?? null,
    voided_by_name: voidedByRes.data?.display_name ?? null,
    lines,
  };
}

// ─────────────────────────────────────────────────────────────
// 列印 — getIssueForPrint(id)
//
// 跟 detail 不同：補撈 subsidiary（買方 letterhead）+ warehouse 地址 + customer 完整資訊。
// 通用 helper、根據 issue_type 切換語意（repair-pick / internal-sale / transfer-out）。
// ─────────────────────────────────────────────────────────────

export type IssueForPrintLine = {
  lineNo: number;
  itemCode: string | null;
  itemName: string;
  uom: string;
  qtyIssued: number;
  unitCost: number | null;
  unitPrice: number | null;
  lineAmount: number | null;
  binLabel: string | null;
  serialNo: string | null;
  batchNo: string | null;
  notes: string | null;
};

export type IssueForPrint = {
  /** stock_issues.id，給 /api/pdf/stock-issue/{id} 用 */
  id: string;
  type: string;             // ro_picking / internal_sale / transfer_out
  docTitle: string;         // 領料單 / 內售出貨單 / 調撥單
  signatureRoles: string[]; // 依 type 切換

  // 買方（公司 letterhead）
  buyer: {
    legalName: string;
    taxId: string | null;
    address: string | null;
    phone: string | null;
    responsible: string | null;
  };
  brand: { key: string; displayName: string };

  // 申請部門 / 來源（取代採購單的 vendor 區塊）
  applicant: {
    /** 譬如「維修廠」「業務部」「調撥出庫」 */
    department: string;
    /** 譬如「RO-20251024-001」「ad-hoc 手動領料」「TR-2025xxx」 */
    sourceDocNo: string | null;
    /** 客戶（如果有，譬如 RO 對應車主、internal sale 對應客戶）*/
    customerName: string | null;
    customerCode: string | null;
    customerPhone: string | null;
  };

  // 出庫倉
  warehouse: {
    code: string | null;
    name: string;
    address: string | null;
  };

  // 單頭
  giNo: string;
  issueDate: string | null;
  status: string;
  notes: string | null;
  roNo: string | null;
  sourceDocType: string | null;
  postedByName: string | null;
  postedAt: string | null;

  // 明細
  lines: IssueForPrintLine[];

  // 統計（內部單據預設無金額，只統計數量；有 line_amount 時也回給上層自行決定要不要印）
  qtyTotal: number;
  amountTotal: number;
  hasAmount: boolean;
};

const ISSUE_TYPE_META: Record<
  string,
  { docTitle: string; department: string; signatures: string[] }
> = {
  ro_picking: {
    docTitle: "領料單 STOCK ISSUE",
    department: "維修廠",
    signatures: ["領料人 / 技師", "倉管", "倉管主管"],
  },
  internal_sale: {
    docTitle: "內售出貨單 INTERNAL SALE",
    department: "業務部",
    signatures: ["業務", "倉管", "業務主管"],
  },
  transfer_out: {
    docTitle: "調撥出庫單 TRANSFER OUT",
    department: "調撥出庫",
    signatures: ["出庫人", "入庫人", "倉管主管"],
  },
};

export async function getIssueForPrint(
  id: string,
): Promise<IssueForPrint | null> {
  const detail = await getIssueById(id);
  if (!detail) return null;

  const supabase = await createClient();
  const scope = await getActiveScope();

  const brandDisplayName: Record<string, string> = {
    ducati: "Ducati Taiwan",
    indian: "Indian Motorcycle Taiwan",
  };

  const [subsRes, whRes, customerRes] = await Promise.all([
    supabase
      .from("subsidiaries")
      .select("legal_name, tax_id, address, phone, responsible_person")
      .eq("id", scope.subsidiary_id)
      .maybeSingle(),
    detail.warehouse_id
      ? supabase
          .from("warehouses")
          .select("code, name, address")
          .eq("id", detail.warehouse_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as const),
    detail.customer_id
      ? supabase
          .from("customers")
          .select("code, name, phone")
          .eq("id", detail.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as const),
  ]);

  const meta =
    ISSUE_TYPE_META[detail.type ?? ""] ?? {
      docTitle: "出庫單 STOCK ISSUE",
      department: "—",
      signatures: ["申請人", "倉管", "主管"],
    };

  // 來源單號：RO 工單優先；ad-hoc / internal sale 用 notes 開頭或標記
  let sourceDocNo: string | null = null;
  if (detail.ro_no) {
    sourceDocNo = `RO ${detail.ro_no}`;
  } else if (detail.type === "ro_picking") {
    sourceDocNo = "ad-hoc 手動領料";
  }

  const lines: IssueForPrintLine[] = detail.lines.map((l) => ({
    lineNo: l.line_no,
    itemCode: l.item_code,
    itemName: l.item_name ?? "—",
    uom: l.uom,
    qtyIssued: Number(l.qty_issued ?? 0),
    unitCost: l.unit_cost,
    unitPrice: l.unit_price,
    lineAmount: l.line_amount,
    binLabel: l.bin_label,
    serialNo: l.serial_no,
    batchNo: l.batch_no,
    notes: l.notes,
  }));

  const qtyTotal = lines.reduce((s, l) => s + l.qtyIssued, 0);
  const amountTotal = lines.reduce(
    (s, l) => s + Number(l.lineAmount ?? 0),
    0,
  );
  // 內部單據預設無金額；只有 internal_sale 確實有 unit_price 才印 totals
  const hasAmount =
    detail.type === "internal_sale" &&
    lines.some((l) => l.unitPrice !== null && Number(l.unitPrice) > 0);

  return {
    id: detail.id,
    type: detail.type ?? "ro_picking",
    docTitle: meta.docTitle,
    signatureRoles: meta.signatures,
    buyer: {
      legalName: subsRes.data?.legal_name ?? "—",
      taxId: subsRes.data?.tax_id ?? null,
      address: subsRes.data?.address ?? null,
      phone: subsRes.data?.phone ?? null,
      responsible: subsRes.data?.responsible_person ?? null,
    },
    brand: {
      key: scope.brand_id,
      displayName: brandDisplayName[scope.brand_id] ?? scope.brand_id,
    },
    applicant: {
      department: meta.department,
      sourceDocNo,
      customerName: customerRes.data?.name ?? detail.customer_name ?? null,
      customerCode: customerRes.data?.code ?? null,
      customerPhone: customerRes.data?.phone ?? null,
    },
    warehouse: {
      code: whRes.data?.code ?? detail.warehouse_code,
      name: whRes.data?.name ?? detail.warehouse_name ?? "—",
      address: whRes.data?.address ?? null,
    },
    giNo: detail.gi_no,
    issueDate: detail.issue_date,
    status: detail.status,
    notes: detail.notes,
    roNo: detail.ro_no,
    sourceDocType: detail.source_doc_type,
    postedByName: detail.posted_by_name,
    postedAt: detail.posted_at,
    lines,
    qtyTotal,
    amountTotal: Math.round(amountTotal * 100) / 100,
    hasAmount,
  };
}

// ─────────────────────────────────────────────────────────────
// New form data + preview
// ─────────────────────────────────────────────────────────────

export type RepairPickWarehouse = {
  id: string;
  code: string | null;
  name: string;
};

export type RepairPickWorkOrderCandidate = {
  id: string;
  ro_no: string;
  status: string;
  customer_name: string | null;
  parts_qty_total: number;
  parts_line_count: number;
  /** 已「足額」領料（所有料件已領數 ≥ 需求數）→ 不再出現在待領清單 */
  already_picked: boolean;
  /** 已領過但尚未足額（部分出庫後待補貨）→ 仍可再領剩餘 */
  partially_picked: boolean;
};

export type RepairPickItemPick = {
  id: string;
  code: string;
  name: string;
  base_uom: string | null;
};

export type RepairPickFormData = {
  warehouses: RepairPickWarehouse[];
  workOrders: RepairPickWorkOrderCandidate[];
  items: RepairPickItemPick[];
};

// ─────────────────────────────────────────────────────────────
// 部分出庫支援：逐 WO 逐 item「已領總量」（completed ro_picking 領料單明細加總）
// 用途：①待領清單判定「足額領料」而非「有領過就排除」②預覽時只算剩餘待領
// ─────────────────────────────────────────────────────────────
async function getIssuedQtyByWoItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  woIds: string[],
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  if (woIds.length === 0) return result;

  const { data: issues } = await supabase
    .from("stock_issues")
    .select("id, ro_id")
    .eq("brand_id", brandId)
    .eq("type", "ro_picking")
    .eq("status", "completed")
    .in("ro_id", woIds);

  const issueToWo = new Map<string, string>();
  const issueIds: string[] = [];
  for (const r of issues ?? []) {
    if (r.ro_id) {
      issueToWo.set(r.id, r.ro_id);
      issueIds.push(r.id);
    }
  }
  if (issueIds.length === 0) return result;

  const { data: lines } = await supabase
    .from("stock_issue_lines")
    .select("gi_id, item_id, qty_issued")
    .in("gi_id", issueIds);

  for (const l of lines ?? []) {
    const wo = issueToWo.get(l.gi_id as string);
    if (!wo || !l.item_id) continue;
    const m = result.get(wo) ?? new Map<string, number>();
    m.set(l.item_id, (m.get(l.item_id) ?? 0) + Number(l.qty_issued ?? 0));
    result.set(wo, m);
  }
  return result;
}

/** 該工單所有 parts 料件是否皆已足額領出（需求數 > 0 的每一項，已領 ≥ 需求）。 */
function isWoFullyPicked(
  needByItem: Map<string, number>,
  issuedByItem: Map<string, number> | undefined,
): boolean {
  let hasNeed = false;
  for (const [item, need] of needByItem) {
    if (need <= 0) continue;
    hasNeed = true;
    if ((issuedByItem?.get(item) ?? 0) < need) return false;
  }
  return hasNeed;
}

export async function getRepairPickFormData(): Promise<RepairPickFormData> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const [whRes, woRes, itemRes] = await Promise.all([
    supabase
      .from("warehouses")
      .select("id, code, name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("work_orders")
      .select("id, ro_no, status, customer_id")
      .eq("brand_id", scope.brand_id)
      .in("status", ["draft", "dispatched", "in_progress", "qc"])
      .order("opened_at", { ascending: false })
      .limit(100),
    supabase
      .from("items")
      .select("id, code, name, base_uom")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code")
      .limit(500),
  ]);

  const woIds = (woRes.data ?? []).map((w) => w.id);
  const cIds = Array.from(
    new Set((woRes.data ?? []).map((w) => w.customer_id).filter((x): x is string => !!x)),
  );

  const [woItemsRes, cRes] = await Promise.all([
    woIds.length
      ? supabase
          .from("work_order_items")
          .select("work_order_id, qty, kind, item_id")
          .in("work_order_id", woIds)
          .eq("kind", "parts")
          .not("item_id", "is", null)
      : Promise.resolve({ data: [], error: null } as const),
    cIds.length
      ? supabase.from("customers").select("id, name").in("id", cIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  const partsAgg = new Map<string, { qty: number; count: number }>();
  const needByWo = new Map<string, Map<string, number>>();
  for (const it of woItemsRes.data ?? []) {
    const cur = partsAgg.get(it.work_order_id) ?? { qty: 0, count: 0 };
    cur.qty += Number(it.qty ?? 0);
    cur.count += 1;
    partsAgg.set(it.work_order_id, cur);
    if (it.item_id) {
      const nm = needByWo.get(it.work_order_id) ?? new Map<string, number>();
      nm.set(it.item_id, (nm.get(it.item_id) ?? 0) + Number(it.qty ?? 0));
      needByWo.set(it.work_order_id, nm);
    }
  }

  const cMap = new Map((cRes.data ?? []).map((c) => [c.id, c.name] as const));

  // 已領量（逐 WO 逐 item）→ 足額才排除，部分出庫的工單保留可繼續領剩餘
  const issuedByWo = await getIssuedQtyByWoItem(supabase, scope.brand_id, woIds);

  const workOrders: RepairPickWorkOrderCandidate[] = (woRes.data ?? [])
    .map((w) => {
      const agg = partsAgg.get(w.id) ?? { qty: 0, count: 0 };
      const need = needByWo.get(w.id) ?? new Map<string, number>();
      const issued = issuedByWo.get(w.id);
      const fully = isWoFullyPicked(need, issued);
      return {
        id: w.id,
        ro_no: w.ro_no,
        status: w.status,
        customer_name: w.customer_id ? cMap.get(w.customer_id) ?? null : null,
        parts_qty_total: agg.qty,
        parts_line_count: agg.count,
        already_picked: fully,
        partially_picked: (issued?.size ?? 0) > 0 && !fully,
      };
    })
    .filter((c) => c.parts_line_count > 0);

  return {
    warehouses: (whRes.data ?? []) as RepairPickWarehouse[],
    workOrders,
    items: (itemRes.data ?? []) as RepairPickItemPick[],
  };
}

// ─────────────────────────────────────────────────────────────
// 待備料工單橫幅（list 頁用）
//
// reuse getRepairPickFormData 的「待領料工單」邏輯：work_orders 在
// draft/dispatched/in_progress/qc 且綁定 parts 料件、且尚未領料完成
// （stock_issues.ro_id 已 completed 的排除）。額外 join customer_vehicles
// → vehicle_models 拿車款/車牌；priority 讀 work_orders.metadata.priority
// （work_orders 無 priority 欄位）fallback 'normal'。
// ─────────────────────────────────────────────────────────────

export type PendingPartsWorkorder = {
  id: string;
  ro_no: string;
  status: string;
  priority: "urgent" | "normal" | "flexible";
  is_urgent: boolean;
  customer_name: string | null;
  vehicle_model_name: string | null;
  license_plate: string | null;
  parts_line_count: number;
  parts_qty_total: number;
  parts_summary: string | null;
};

function normalizePriority(raw: unknown): "urgent" | "normal" | "flexible" {
  return raw === "urgent" || raw === "flexible" ? raw : "normal";
}

export async function listPendingPartsWorkorders(): Promise<PendingPartsWorkorder[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  // 1) 候選工單（同 getRepairPickFormData 邏輯）
  const woRes = await supabase
    .from("work_orders")
    .select("id, ro_no, status, customer_id, vehicle_id, metadata")
    .eq("brand_id", scope.brand_id)
    .in("status", ["draft", "dispatched", "in_progress", "qc"])
    .order("opened_at", { ascending: false })
    .limit(100);

  const wos = woRes.data ?? [];
  const woIds = wos.map((w) => w.id);
  if (woIds.length === 0) return [];

  // 已領量（逐 WO 逐 item）→ 足額才排除（部分出庫待補貨的工單仍要出現在備料橫幅）
  const issuedByWo = await getIssuedQtyByWoItem(supabase, scope.brand_id, woIds);

  const cIds = Array.from(
    new Set(wos.map((w) => w.customer_id).filter((x): x is string => !!x)),
  );
  const vIds = Array.from(
    new Set(wos.map((w) => w.vehicle_id).filter((x): x is string => !!x)),
  );

  // 2) parts lines（含品名摘要）+ 車主 + 車輛
  const [woItemsRes, cRes, vRes] = await Promise.all([
    supabase
      .from("work_order_items")
      .select("work_order_id, qty, item_id, description")
      .in("work_order_id", woIds)
      .eq("kind", "parts")
      .not("item_id", "is", null),
    cIds.length
      ? supabase.from("customers").select("id, name").in("id", cIds)
      : Promise.resolve({ data: [], error: null } as const),
    vIds.length
      ? supabase
          .from("customer_vehicles")
          .select("id, license_plate, model_id")
          .in("id", vIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  // 3a) parts 料件名（items；description 為 null 時 fallback 用）
  const itemIds = Array.from(
    new Set(
      (woItemsRes.data ?? [])
        .map((it) => it.item_id)
        .filter((x): x is string => !!x),
    ),
  );
  const itemRes = itemIds.length
    ? await supabase.from("items").select("id, name").in("id", itemIds)
    : ({ data: [], error: null } as const);
  const itemNameMap = new Map(
    (itemRes.data ?? []).map((it) => [it.id, it.name] as const),
  );

  // 3) 車款名（vehicle_models）
  const modelIds = Array.from(
    new Set(
      (vRes.data ?? [])
        .map((v) => v.model_id)
        .filter((x): x is string => !!x),
    ),
  );
  const mRes = modelIds.length
    ? await supabase
        .from("vehicle_models")
        .select("id, display_name, model_name")
        .in("id", modelIds)
    : ({ data: [], error: null } as const);

  // 聚合 parts：項數 / 總數 / 品名摘要
  const partsAgg = new Map<
    string,
    { qty: number; count: number; names: string[] }
  >();
  const needByWo = new Map<string, Map<string, number>>();
  for (const it of woItemsRes.data ?? []) {
    const cur =
      partsAgg.get(it.work_order_id) ?? { qty: 0, count: 0, names: [] };
    cur.qty += Number(it.qty ?? 0);
    cur.count += 1;
    const nm =
      (it.item_id ? itemNameMap.get(it.item_id) : null) ?? it.description;
    if (nm) cur.names.push(nm);
    partsAgg.set(it.work_order_id, cur);
    if (it.item_id) {
      const m = needByWo.get(it.work_order_id) ?? new Map<string, number>();
      m.set(it.item_id, (m.get(it.item_id) ?? 0) + Number(it.qty ?? 0));
      needByWo.set(it.work_order_id, m);
    }
  }

  const cMap = new Map((cRes.data ?? []).map((c) => [c.id, c.name] as const));
  const mMap = new Map(
    (mRes.data ?? []).map(
      (m) => [m.id, m.display_name ?? m.model_name ?? null] as const,
    ),
  );
  const vMap = new Map(
    (vRes.data ?? []).map(
      (v) =>
        [
          v.id,
          {
            license_plate: v.license_plate ?? null,
            model_name: v.model_id ? mMap.get(v.model_id) ?? null : null,
          },
        ] as const,
    ),
  );

  return wos
    .map((w): PendingPartsWorkorder | null => {
      const agg = partsAgg.get(w.id);
      if (!agg || agg.count === 0) return null; // 沒綁料件不列
      if (isWoFullyPicked(needByWo.get(w.id) ?? new Map(), issuedByWo.get(w.id)))
        return null; // 已足額領料不列（部分出庫待補貨者保留）

      const veh = w.vehicle_id ? vMap.get(w.vehicle_id) : undefined;
      const meta = (w.metadata ?? {}) as Record<string, unknown>;
      const priority = normalizePriority(meta.priority);
      const summary =
        agg.names.length > 0
          ? agg.names.slice(0, 3).join("、") +
            (agg.names.length > 3 ? ` …等 ${agg.names.length} 項` : "")
          : null;

      return {
        id: w.id,
        ro_no: w.ro_no,
        status: w.status,
        priority,
        is_urgent: priority === "urgent",
        customer_name: w.customer_id ? cMap.get(w.customer_id) ?? null : null,
        vehicle_model_name: veh?.model_name ?? null,
        license_plate: veh?.license_plate ?? null,
        parts_line_count: agg.count,
        parts_qty_total: agg.qty,
        parts_summary: summary,
      };
    })
    .filter((x): x is PendingPartsWorkorder => x !== null)
    // 緊急優先排前
    .sort((a, b) => (a.is_urgent === b.is_urgent ? 0 : a.is_urgent ? -1 : 1));
}

export type RepairPickPreviewLine = {
  line_no: number;
  item_id: string;
  item_code: string | null;
  item_name: string;
  qty_needed: number;
  /** 淨可用量（on_hand available − 其他工單的 active 預留）。本工單自己的預留不扣（出庫時會 consume）。 */
  qty_available: number;
  /** 被「其他工單」active 預留卡住的數量（場景一：防止多工單搶同一料）。> 0 時 UI 顯示「已被其他工單預留」。 */
  reserved_by_others: number;
  shortage: number;
  unit_cost_estimate: number;
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

export type RepairPickPreview = {
  warehouse_id: string;
  work_order_id: string | null;
  lines: RepairPickPreviewLine[];
  can_post: boolean;
  qty_total: number;
  amount_total: number;
};

export type PreviewInput =
  | { mode: "ro"; work_order_id: string; warehouse_id: string }
  | {
      mode: "adhoc";
      warehouse_id: string;
      lines: Array<{ item_id: string; qty_needed: number }>;
    };

export async function previewRepairPick(
  input: PreviewInput,
): Promise<Result<RepairPickPreview>> {
  if (!input.warehouse_id) return { ok: false, error: "缺出庫倉" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  // 統一收成 { item_id, qty_needed }[] 餵 FIFO 配置
  let needs: Array<{ item_id: string; qty_needed: number; description: string }>;
  let workOrderId: string | null = null;
  // 預留的 ro_id 對映 repair_orders（非 work_orders）→ 排除「本工單自己的預留」要用 repair_order_id 比對
  let repairOrderId: string | null = null;

  if (input.mode === "ro") {
    if (!input.work_order_id) return { ok: false, error: "缺 work_order_id" };
    workOrderId = input.work_order_id;

    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, ro_no, status, repair_order_id")
      .eq("id", input.work_order_id)
      .eq("brand_id", scope.brand_id)
      .maybeSingle();
    if (woErr) return { ok: false, error: woErr.message };
    repairOrderId = (wo as { repair_order_id?: string | null } | null)?.repair_order_id ?? null;
    if (!wo) return { ok: false, error: "找不到工單" };

    const { data: woItems, error: woItemsErr } = await supabase
      .from("work_order_items")
      .select("id, item_id, qty, description")
      .eq("work_order_id", wo.id)
      .eq("kind", "parts")
      .not("item_id", "is", null);
    if (woItemsErr) return { ok: false, error: woItemsErr.message };
    if (!woItems || woItems.length === 0) {
      return { ok: false, error: "此工單沒有料件項目（kind='parts' 且綁定 item_id）" };
    }

    // 依 item 加總需求（同一料件多行合併，避免 FIFO 重複配置）
    const needByItem = new Map<string, { qty: number; description: string }>();
    for (const it of woItems) {
      const id = it.item_id as string;
      const cur = needByItem.get(id) ?? { qty: 0, description: it.description ?? "" };
      cur.qty += Number(it.qty ?? 0);
      if (!cur.description && it.description) cur.description = it.description;
      needByItem.set(id, cur);
    }

    // 部分出庫：扣掉「先前已領數量」，只預覽剩餘待領（補貨到貨後再領剩餘）
    const issuedMap =
      (await getIssuedQtyByWoItem(supabase, scope.brand_id, [wo.id])).get(wo.id) ??
      new Map<string, number>();

    needs = [];
    for (const [item_id, v] of needByItem) {
      const remaining = v.qty - (issuedMap.get(item_id) ?? 0);
      if (remaining > 0) {
        needs.push({ item_id, qty_needed: remaining, description: v.description });
      }
    }
    if (needs.length === 0) {
      return { ok: false, error: "此工單料件皆已足額領出，無待領項目。" };
    }
  } else {
    if (!input.lines?.length) return { ok: false, error: "請至少加一筆料件" };
    for (const l of input.lines) {
      if (!l.item_id) return { ok: false, error: "明細缺料件" };
      if (!(l.qty_needed > 0)) return { ok: false, error: "明細數量需 > 0" };
    }
    needs = input.lines.map((l) => ({
      item_id: l.item_id,
      qty_needed: Number(l.qty_needed),
      description: "",
    }));
  }

  // 撈料件名稱
  const itemIds = Array.from(new Set(needs.map((n) => n.item_id)));
  const { data: itemRows } = await supabase
    .from("items")
    .select("id, code, name")
    .in("id", itemIds);
  const itemMap = new Map(
    (itemRows ?? []).map((it) => [it.id, { code: it.code, name: it.name }] as const),
  );

  // 場景一：可用量必須扣掉「其他工單」的 active 預留（防多工單搶同一料）。
  // 一次撈齊這批 item 在該倉的 active 預留，排除「本工單自己」的預留（自己的出庫時會 consume，不該擋自己）。
  // adhoc（無 workOrderId）→ 全部 active 預留都算「別人的」，一律扣。
  const reservedByOthersMap = new Map<string, number>();
  {
    const { data: resvRows, error: resvErr } = await supabase
      .from("inventory_reservations")
      .select("item_id, reserved_qty, consumed_qty, ro_id")
      .eq("brand_id", scope.brand_id)
      .eq("warehouse_id", input.warehouse_id)
      .in("item_id", itemIds)
      .eq("status", "active");
    if (resvErr) return { ok: false, error: resvErr.message };
    for (const r of resvRows ?? []) {
      // 自己的預留不擋自己：reservations.ro_id 對映 repair_orders，用本工單的 repair_order_id 比對
      if (repairOrderId && r.ro_id === repairOrderId) continue;
      const rem = Number(r.reserved_qty) - Number(r.consumed_qty ?? 0);
      if (rem > 0) {
        reservedByOthersMap.set(r.item_id, (reservedByOthersMap.get(r.item_id) ?? 0) + rem);
      }
    }
  }

  // 對每個 need 跑 FIFO 配置
  const previewLines: RepairPickPreviewLine[] = [];
  let qty_total = 0;
  let amount_total = 0;
  let can_post = true;

  for (let i = 0; i < needs.length; i++) {
    const n = needs[i];
    const { data: stocks, error: stockErr } = await supabase
      .from("stock_items")
      .select("id, qty, bin_id, unit_cost, serial_no, batch_no, created_at")
      .eq("brand_id", scope.brand_id)
      .eq("warehouse_id", input.warehouse_id)
      .eq("item_id", n.item_id)
      .eq("status", "available")
      .gt("qty", 0)
      .order("created_at", { ascending: true });
    if (stockErr) return { ok: false, error: stockErr.message };

    // 原始在庫可用量（純加總，未扣預留）
    let rawAvailable = 0;
    for (const s of stocks ?? []) rawAvailable += Number(s.qty);
    // 場景一：淨可用量 = 原始可用 − 其他工單的 active 預留；本次可配置量以此為上限
    const reservedByOthers = reservedByOthersMap.get(n.item_id) ?? 0;
    const qty_available = Math.max(0, rawAvailable - reservedByOthers);

    let remaining = n.qty_needed;
    let budget = qty_available; // 不可領超過淨可用量（被別單預留的部分要留給對方）
    const picks: RepairPickPreviewLine["picks"] = [];
    let unit_cost_estimate = 0;
    for (const s of stocks ?? []) {
      if (remaining <= 0 || budget <= 0) break;
      const take = Math.min(Number(s.qty), remaining, budget);
      if (take <= 0) continue;
      const uc = Number(s.unit_cost ?? 0);
      picks.push({
        stock_id: s.id,
        bin_id: s.bin_id,
        bin_label: null,
        qty: take,
        unit_cost: uc,
        serial_no: s.serial_no,
        batch_no: s.batch_no,
      });
      remaining -= take;
      budget -= take;
      unit_cost_estimate = uc;
    }

    const shortage = Math.max(0, remaining); // 含「被別單預留卡住」而領不到的部分
    if (shortage > 0) can_post = false;

    qty_total += n.qty_needed - remaining;
    amount_total += picks.reduce((s, p) => s + p.qty * p.unit_cost, 0);

    previewLines.push({
      line_no: i + 1,
      item_id: n.item_id,
      item_code: itemMap.get(n.item_id)?.code ?? null,
      item_name: itemMap.get(n.item_id)?.name ?? n.description ?? "(unknown)",
      qty_needed: n.qty_needed,
      qty_available,
      reserved_by_others: reservedByOthers,
      shortage,
      unit_cost_estimate,
      picks,
    });
  }

  // 撈 bin label
  const binIds = Array.from(
    new Set(previewLines.flatMap((l) => l.picks.map((p) => p.bin_id)).filter((x): x is string => !!x)),
  );
  if (binIds.length) {
    const { data: bins } = await supabase
      .from("warehouse_bins")
      .select("id, code, name")
      .in("id", binIds);
    const binMap = new Map(
      (bins ?? []).map((b) => [b.id, b.code ?? b.name] as const),
    );
    for (const l of previewLines) {
      for (const p of l.picks) {
        if (p.bin_id) p.bin_label = binMap.get(p.bin_id) ?? null;
      }
    }
  }

  return {
    ok: true,
    data: {
      warehouse_id: input.warehouse_id,
      work_order_id: workOrderId,
      lines: previewLines,
      can_post,
      qty_total: Math.round(qty_total * 100) / 100,
      amount_total: Math.round(amount_total * 100) / 100,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

async function nextGiNo(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const { data: last } = await supabase
    .from("stock_issues")
    .select("gi_no")
    .like("gi_no", `ISS${dateStr}-%`)
    .order("gi_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (last?.gi_no) {
    const m = last.gi_no.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `ISS${dateStr}-${String(seq).padStart(3, "0")}`;
}

/** 領料/出庫過帳結果。部分出庫時帶 partial=true + 自動產生的補貨需求單號。 */
export type PickResult = {
  id: string;
  gi_no: string;
  /** 是否為部分出庫（有缺貨行轉補貨）*/
  partial?: boolean;
  /** 自動建立的補貨需求單號（部分出庫時）*/
  req_no?: string;
  /** 缺貨（轉補貨）的料件項數 */
  shortage_count?: number;
};

export type CreateRepairPickInput = {
  work_order_id: string;
  warehouse_id: string;
  notes?: string;
};

export async function pickForWorkOrder(
  input: CreateRepairPickInput,
): Promise<Result<PickResult>> {
  if (!(await hasPermission(PERMISSIONS.ISSUE_CREATE))) {
    return { ok: false, error: "沒有建立領料單的權限" };
  }
  if (!input.work_order_id) return { ok: false, error: "缺工單" };
  if (!input.warehouse_id) return { ok: false, error: "缺出庫倉" };

  const previewRes = await previewRepairPick({
    mode: "ro",
    work_order_id: input.work_order_id,
    warehouse_id: input.warehouse_id,
  });
  if (!previewRes.ok) return previewRes;
  // 部分出庫（Russell 6/17 裁示一）：不再要求全部到齊才能過帳。
  // 只要有任一品項有可用庫存（qty_total > 0）即放行，缺貨品項自動轉補貨。
  // 完全無庫存可出時才擋下，引導改建補貨需求單。
  if (previewRes.data.qty_total <= 0) {
    return {
      ok: false,
      error: "所選料件目前完全無可用庫存，無法出庫；請改用『建立補貨需求單』登記待補。",
    };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: wo } = await supabase
    .from("work_orders")
    .select("id, ro_no, customer_id, repair_order_id")
    .eq("id", input.work_order_id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!wo) return { ok: false, error: "找不到工單" };

  return persistPick({
    supabase,
    brandId: scope.brand_id,
    userId: user?.id ?? null,
    type: "ro_picking",
    warehouseId: input.warehouse_id,
    customerId: wo.customer_id ?? null,
    roId: wo.id,
    sourceDocType: "work_order",
    sourceDocId: wo.id,
    notes: input.notes ?? `RO ${wo.ro_no} 一鍵領料`,
    preview: previewRes.data,
    postCogs: true,
    autoBackorder: true,
    roNo: wo.ro_no,
    repairOrderId: (wo as { repair_order_id?: string | null }).repair_order_id ?? null,
  });
}

export type CreateAdHocPickInput = {
  warehouse_id: string;
  customer_id?: string | null;
  notes: string;
  lines: Array<{ item_id: string; qty_needed: number; line_notes?: string | null }>;
};

export async function pickAdHoc(
  input: CreateAdHocPickInput,
): Promise<Result<PickResult>> {
  if (!(await hasPermission(PERMISSIONS.ISSUE_CREATE))) {
    return { ok: false, error: "沒有建立領料單的權限" };
  }
  if (!input.warehouse_id) return { ok: false, error: "缺出庫倉" };
  if (!input.notes?.trim()) return { ok: false, error: "ad-hoc 領料需填寫原因" };
  if (!input.lines?.length) return { ok: false, error: "請至少加一筆料件" };

  const previewRes = await previewRepairPick({
    mode: "adhoc",
    warehouse_id: input.warehouse_id,
    lines: input.lines.map((l) => ({ item_id: l.item_id, qty_needed: l.qty_needed })),
  });
  if (!previewRes.ok) return previewRes;
  // 部分出庫：有可用庫存即放行，缺貨自動轉補貨；完全無庫存才擋。
  if (previewRes.data.qty_total <= 0) {
    return {
      ok: false,
      error: "所選料件目前完全無可用庫存，無法出庫；請改用『建立補貨需求單』登記待補。",
    };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data: { user } } = await supabase.auth.getUser();

  return persistPick({
    supabase,
    brandId: scope.brand_id,
    userId: user?.id ?? null,
    type: "ro_picking",
    warehouseId: input.warehouse_id,
    customerId: input.customer_id ?? null,
    roId: null,
    sourceDocType: null,
    sourceDocId: null,
    notes: input.notes.trim(),
    preview: previewRes.data,
    lineNotes: input.lines.map((l, i) => ({ line_no: i + 1, notes: l.line_notes ?? null })),
    postCogs: true,
    autoBackorder: true,
    roNo: null,
  });
}

async function persistPick(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  brandId: string;
  userId: string | null;
  type: string;
  warehouseId: string;
  customerId: string | null;
  roId: string | null;
  sourceDocType: string | null;
  sourceDocId: string | null;
  notes: string;
  preview: RepairPickPreview;
  lineNotes?: Array<{ line_no: number; notes: string | null }>;
  /** 可選：依 line_no 指定該行的售價（per qty），預設用 stock_items.unit_cost。 */
  linePrices?: Array<{ line_no: number; unit_price: number }>;
  /**
   * 是否認列銷貨成本（COGS_ON_ISSUE：Dr 銷貨成本 / Cr 存貨）。
   * RO 領料 / ad-hoc 出庫 = true（這些原本完全沒記 COGS，是 GL 缺口）。
   * 內售出貨 = false（createInternalSale 自己走 PARTS_RETAIL_SALE 已含 COGS，勿重複）。
   * COGS 只認列「實際出庫」的 picks 成本（部分出庫時待補貨品項不會被預先認列）。
   */
  postCogs?: boolean;
  /**
   * 部分出庫（Russell 6/17 裁示一）：缺貨品項自動建補貨需求單 + 回寫工單關聯。
   * RO 領料 / ad-hoc = true；內售 / RO addon = false（沿用原嚴格流程）。
   */
  autoBackorder?: boolean;
  /** 工單 RO 號，for 補貨需求單顯示（autoBackorder 時用）*/
  roNo?: string | null;
  /** 對映的 repair_order_id（inventory_reservations.ro_id 指向 repair_orders，consume 預留要用這個比對）*/
  repairOrderId?: string | null;
}): Promise<Result<PickResult>> {
  const { supabase, brandId, userId, type, warehouseId, customerId, roId, sourceDocType, sourceDocId, notes, preview, lineNotes, linePrices, postCogs, autoBackorder, roNo, repairOrderId } = args;

  const gi_no = await nextGiNo(supabase);
  const now = new Date();

  const priceMap = new Map((linePrices ?? []).map((p) => [p.line_no, p.unit_price] as const));

  // 若有指定 linePrices → 重算 amount_total 為 sum of (qty_needed × unit_price)
  let computedAmountTotal = preview.amount_total;
  if (linePrices && linePrices.length > 0) {
    computedAmountTotal = 0;
    for (const l of preview.lines) {
      const price = priceMap.get(l.line_no);
      if (price === undefined) continue;
      computedAmountTotal += l.qty_needed * price;
    }
    computedAmountTotal = Math.round(computedAmountTotal * 100) / 100;
  }

  const { data: issue, error: issueErr } = await supabase
    .from("stock_issues")
    .insert({
      brand_id: brandId,
      gi_no,
      type,
      status: "completed",
      warehouse_id: warehouseId,
      customer_id: customerId,
      ro_id: roId,
      source_doc_type: sourceDocType,
      source_doc_id: sourceDocId,
      issue_date: now.toISOString().slice(0, 10),
      qty_issued_total: preview.qty_total,
      amount_total: computedAmountTotal,
      notes,
      posted_at: now.toISOString(),
      posted_by: userId,
    })
    .select("id")
    .single();
  if (issueErr) return { ok: false, error: `建立領料單失敗：${issueErr.message}` };

  const noteMap = new Map((lineNotes ?? []).map((n) => [n.line_no, n.notes] as const));
  const linesToInsert: Array<Record<string, unknown>> = [];
  let lineCounter = 1;
  for (const l of preview.lines) {
    const lineNoteValue = noteMap.get(l.line_no) ?? null;
    const linePrice = priceMap.get(l.line_no);
    for (const p of l.picks) {
      const unitPrice = linePrice !== undefined ? linePrice : p.unit_cost;
      const lineAmount = Math.round(p.qty * unitPrice * 100) / 100;
      linesToInsert.push({
        brand_id: brandId,
        gi_id: issue.id,
        line_no: lineCounter++,
        item_id: l.item_id,
        bin_id: p.bin_id,
        qty_issued: p.qty,
        uom: "PCS",
        unit_cost: p.unit_cost,
        unit_price: unitPrice,
        line_amount: lineAmount,
        serial_no: p.serial_no,
        batch_no: p.batch_no,
        notes: lineNoteValue,
      });
    }
  }
  const { error: linesErr } = await supabase.from("stock_issue_lines").insert(linesToInsert);
  if (linesErr) {
    await supabase.from("stock_issues").delete().eq("id", issue.id);
    return { ok: false, error: `建立明細失敗：${linesErr.message}` };
  }

  // 扣 stock_items
  for (const l of preview.lines) {
    for (const p of l.picks) {
      const { data: cur } = await supabase
        .from("stock_items")
        .select("qty")
        .eq("id", p.stock_id)
        .single();
      const newQty = Number(cur?.qty ?? 0) - p.qty;
      const update: Record<string, unknown> = {
        qty: Math.max(0, Math.round(newQty * 100) / 100),
        last_movement_at: new Date().toISOString(),
      };
      if (newQty <= 0) update.status = "issued";
      await supabase.from("stock_items").update(update).eq("id", p.stock_id);
    }
  }

  // 場景二：回寫工單零件費用（同步、即時可見）。
  // 此前 work_orders.parts_amount 從來沒被任何流程更新 → 工單看不到實際出庫成本。
  // 做法：彙總該工單所有「未作廢」領料單的 amount_total = 實際零件費用，回寫 parts_amount，
  //       並重算 total_amount = parts + labor + external − discount。
  // 失敗只記 log 不中斷（庫存已扣、領料單已建，硬擋反而造成不一致；沿用 partial-pick 容錯慣例）。
  if (sourceDocType === "work_order" && roId) {
    const { data: woIssues, error: woIssuesErr } = await supabase
      .from("stock_issues")
      .select("amount_total")
      .eq("brand_id", brandId)
      .eq("source_doc_type", "work_order")
      .eq("source_doc_id", roId)
      .neq("status", "cancelled");
    if (woIssuesErr) {
      console.error("[scene2] 彙總工單領料金額失敗", { gi_no, ro_id: roId, error: woIssuesErr.message });
    } else {
      const partsAmount =
        Math.round((woIssues ?? []).reduce((s, r) => s + Number(r.amount_total ?? 0), 0) * 100) / 100;
      const { data: woAmt } = await supabase
        .from("work_orders")
        .select("labor_amount, external_amount, discount_amount")
        .eq("id", roId)
        .eq("brand_id", brandId)
        .maybeSingle();
      const labor = Number(woAmt?.labor_amount ?? 0);
      const external = Number(woAmt?.external_amount ?? 0);
      const discount = Number(woAmt?.discount_amount ?? 0);
      const totalAmount = Math.round((partsAmount + labor + external - discount) * 100) / 100;
      const { error: woUpdErr } = await supabase
        .from("work_orders")
        .update({
          parts_amount: partsAmount,
          total_amount: totalAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", roId)
        .eq("brand_id", brandId);
      if (woUpdErr) {
        console.error("[scene2] 回寫工單零件費用失敗（不影響已出庫）", {
          gi_no,
          ro_id: roId,
          error: woUpdErr.message,
        });
      }
    }
  }

  // 消耗預留（inventory_reservations active → consumed）— 非阻塞、不影響主流程。
  // 依 repair_order_id + item_id 比對（reservations.ro_id 對映 repair_orders，非 work_orders）。
  // 此前用 work_order.id 比對 ro_id → id 空間不符、永遠 match 不到、預留從不被 consume（pre-existing bug）。
  if (repairOrderId) {
    const consumeRoId = repairOrderId;
    after(async () => {
      try {
        // 彙整本次各 item 已領總量
        const issuedByItem = new Map<string, number>();
        for (const l of preview.lines) {
          issuedByItem.set(l.item_id, (issuedByItem.get(l.item_id) ?? 0) + l.qty_needed);
        }
        const nowIso = new Date().toISOString();
        for (const [itemId, qtyIssued] of issuedByItem) {
          // 找對應工單的 active 預留（item + ro_id 精確比對）
          const { data: reservations, error: resErr } = await supabase
            .from("inventory_reservations")
            .select("id, reserved_qty, consumed_qty")
            .eq("brand_id", brandId)
            .eq("item_id", itemId)
            .eq("ro_id", consumeRoId)
            .eq("status", "active")
            .order("reserved_at", { ascending: true });
          if (resErr) {
            console.error("[consume reservation] 查預留失敗", { gi_no, item_id: itemId, error: resErr.message });
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
              console.error("[consume reservation] 更新失敗", { gi_no, reservation_id: res.id, error: updErr.message });
            }
            remaining -= toConsume;
          }
        }
      } catch (e) {
        console.error("[consume reservation] 例外（不影響主流程）", e);
      }
    });
  }

  // 認列銷貨成本（COGS_ON_ISSUE）— 非阻塞、autoPost。
  // cost_amount = 實際消耗層成本（Σ qty×unit_cost），與存貨減少完全 tie-out。
  // 依 item 聚合，一張 entry/item（沿用 PARTS_PURCHASE 的聚合慣例）。
  if (postCogs) {
    const cogsByItem = new Map<string, number>();
    for (const l of preview.lines) {
      let c = 0;
      for (const p of l.picks) c += p.qty * p.unit_cost;
      if (c > 0) cogsByItem.set(l.item_id, (cogsByItem.get(l.item_id) ?? 0) + c);
    }
    if (cogsByItem.size > 0) {
      const issueDate = now.toISOString().slice(0, 10);
      after(async () => {
        for (const [itemId, cost] of cogsByItem) {
          const costAmount = Math.round(cost * 100) / 100;
          if (!(costAmount > 0)) continue;
          const res = await instantiateTransaction(
            TX_TYPES.COGS_ON_ISSUE,
            { item_id: itemId, cost_amount: costAmount, warehouse_id: warehouseId },
            { autoPost: true, entryDate: issueDate, userId: userId ?? undefined },
          );
          if (!res.ok) {
            console.error("[accounting] COGS_ON_ISSUE 過帳失敗", { gi_no, item_id: itemId, error: res.error });
          } else {
            console.log("[accounting] COGS_ON_ISSUE 已過帳", { gi_no, item_id: itemId, journal_entry: res.data });
          }
        }
      });
    }
  }

  // ── 部分出庫：缺貨品項自動轉「待補貨」+ 回寫工單關聯（Russell 6/17 裁示一）──
  // 缺貨件不消失、不變孤兒：① 自動建補貨需求單（連結本領料單 + 工單）
  // ② 領料單 metadata 標記部分出庫 ③ 回寫 work_order_items metadata（待補貨 + 補貨單號）
  let backorderReqNo: string | null = null;
  const shortageLines = preview.lines
    .filter((l) => l.shortage > 0)
    .map((l) => ({
      item_id: l.item_id,
      item_code: l.item_code,
      item_name: l.item_name,
      qty_shortage: l.shortage,
    }));

  if (autoBackorder && shortageLines.length > 0) {
    // ① 自動建補貨需求單
    const repRes = await createReplenishmentRequest({
      issue_id: issue.id,
      work_order_id: roId,
      ro_no: roNo ?? null,
      warehouse_id: warehouseId,
      shortage_lines: shortageLines,
    });
    if (repRes.ok) {
      backorderReqNo = repRes.data.req_no;
    } else {
      console.error("[partial-pick] 自動建補貨需求失敗（不影響已出庫部分）", {
        gi_no,
        error: repRes.error,
      });
    }

    // ② 領料單 metadata 標記部分出庫（領料單詳情可顯示）
    const { error: metaErr } = await supabase
      .from("stock_issues")
      .update({
        metadata: {
          partial_pick: true,
          backorder_req_no: backorderReqNo,
          shortage_lines: shortageLines,
        },
      })
      .eq("id", issue.id);
    if (metaErr) {
      console.error("[partial-pick] 標記領料單 metadata 失敗", { gi_no, error: metaErr.message });
    }

    // ③ 回寫工單料件關聯（非阻塞）— 缺貨件在原工單上保留可追蹤關聯
    if (roId) {
      const reqNo = backorderReqNo;
      const issueId = issue.id;
      const stampIso = now.toISOString();
      after(async () => {
        try {
          for (const sl of shortageLines) {
            const { data: woiRows } = await supabase
              .from("work_order_items")
              .select("id, metadata")
              .eq("work_order_id", roId)
              .eq("item_id", sl.item_id)
              .eq("kind", "parts");
            for (const row of woiRows ?? []) {
              const meta = (row.metadata ?? {}) as Record<string, unknown>;
              await supabase
                .from("work_order_items")
                .update({
                  metadata: {
                    ...meta,
                    backorder: {
                      status: "待補貨",
                      req_no: reqNo,
                      issue_id: issueId,
                      qty_shortage: sl.qty_shortage,
                      created_at: stampIso,
                    },
                  },
                })
                .eq("id", row.id);
            }
          }
        } catch (e) {
          console.error("[partial-pick] 回寫工單關聯失敗（不影響主流程）", e);
        }
      });
    }
  }

  revalidatePath("/parts/issue/repair-pick");
  revalidatePath("/parts/operations/balance");
  if (sourceDocId) revalidatePath(`/admin/master-data/work-orders/${sourceDocId}`);
  return {
    ok: true,
    data: {
      id: issue.id,
      gi_no,
      partial: shortageLines.length > 0,
      req_no: backorderReqNo ?? undefined,
      shortage_count: shortageLines.length,
    },
  };
}

export type UpdateIssueInput = {
  notes?: string | null;
  line_notes?: Array<{ id: string; notes: string | null }>;
};

export async function updateIssue(
  id: string,
  patch: UpdateIssueInput,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.ISSUE_CREATE))) {
    return { ok: false, error: "沒有修改領料單的權限" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: current, error: curErr } = await supabase
    .from("stock_issues")
    .select("status")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (curErr) return { ok: false, error: curErr.message };
  if (!current) return { ok: false, error: "找不到領料單" };
  if (current.status === "cancelled") {
    return { ok: false, error: "已作廢的領料單不可修改" };
  }

  if (patch.notes !== undefined) {
    const { error: upErr } = await supabase
      .from("stock_issues")
      .update({ notes: patch.notes })
      .eq("id", id);
    if (upErr) return { ok: false, error: upErr.message };
  }

  if (patch.line_notes && patch.line_notes.length > 0) {
    for (const ln of patch.line_notes) {
      const { error: lnErr } = await supabase
        .from("stock_issue_lines")
        .update({ notes: ln.notes })
        .eq("id", ln.id)
        .eq("gi_id", id);
      if (lnErr) return { ok: false, error: `明細備註更新失敗:${lnErr.message}` };
    }
  }

  revalidatePath("/parts/issue/repair-pick");
  revalidatePath(`/parts/issue/repair-pick/${id}`);
  return { ok: true, data: { id } };
}

export async function voidIssue(
  id: string,
  reason: string,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.ISSUE_CREATE))) {
    return { ok: false, error: "沒有作廢領料單的權限" };
  }
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "請填寫作廢原因" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: issue, error: issueErr } = await supabase
    .from("stock_issues")
    .select("id, gi_no, status, warehouse_id, brand_id")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (issueErr) return { ok: false, error: issueErr.message };
  if (!issue) return { ok: false, error: "找不到領料單" };
  if (issue.status !== "completed") {
    return { ok: false, error: `狀態 ${issue.status} 不可作廢（需 completed）` };
  }

  const { data: lines, error: linesErr } = await supabase
    .from("stock_issue_lines")
    .select("id, item_id, bin_id, qty_issued, unit_cost, serial_no, batch_no")
    .eq("gi_id", id);
  if (linesErr) return { ok: false, error: linesErr.message };

  // 還原：建新 available stock_items rows（不抓原 row 還，跟舊 cancelIssue 一致）
  if (lines && lines.length > 0) {
    const newStocks = lines.map((l) => ({
      brand_id: scope.brand_id,
      item_id: l.item_id,
      warehouse_id: issue.warehouse_id,
      bin_id: l.bin_id,
      qty: Number(l.qty_issued),
      unit_cost: l.unit_cost ?? 0,
      status: "available",
      serial_no: l.serial_no,
      batch_no: l.batch_no,
      notes: `領料單 ${issue.gi_no} 作廢還原`,
    }));
    const { error: insertErr } = await supabase.from("stock_items").insert(newStocks);
    if (insertErr) return { ok: false, error: `還原庫存失敗：${insertErr.message}` };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { error: voidErr } = await supabase
    .from("stock_issues")
    .update({
      status: "cancelled",
      voided_at: new Date().toISOString(),
      voided_by: user?.id ?? null,
      void_reason: trimmed,
    })
    .eq("id", id);
  if (voidErr) return { ok: false, error: `作廢失敗：${voidErr.message}` };

  revalidatePath("/parts/issue/repair-pick");
  revalidatePath(`/parts/issue/repair-pick/${id}`);
  revalidatePath("/parts/issue/internal-sale");
  revalidatePath(`/parts/issue/internal-sale/${id}`);
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// Internal Sale（內售出貨）— form data + mutation
// ─────────────────────────────────────────────────────────────

export type InternalSaleFormData = {
  warehouses: Array<{ id: string; code: string | null; name: string }>;
  customers: Array<{ id: string; code: string | null; name: string }>;
  items: Array<{ id: string; code: string; name: string; base_uom: string | null }>;
};

export async function getInternalSaleFormData(): Promise<InternalSaleFormData> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const [whRes, cuRes, itemRes] = await Promise.all([
    supabase
      .from("warehouses")
      .select("id, code, name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("customers")
      .select("id, code, name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code")
      .limit(500),
    supabase
      .from("items")
      .select("id, code, name, base_uom")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code")
      .limit(500),
  ]);
  return {
    warehouses: (whRes.data ?? []) as InternalSaleFormData["warehouses"],
    customers: (cuRes.data ?? []) as InternalSaleFormData["customers"],
    items: (itemRes.data ?? []) as InternalSaleFormData["items"],
  };
}

export type CreateInternalSaleInput = {
  warehouse_id: string;
  customer_id?: string | null;
  notes: string;
  lines: Array<{
    item_id: string;
    qty_needed: number;
    unit_price: number;
    line_notes?: string | null;
  }>;
};

export async function createInternalSale(
  input: CreateInternalSaleInput,
): Promise<Result<{ id: string; gi_no: string }>> {
  if (!(await hasPermission(PERMISSIONS.ISSUE_CREATE))) {
    return { ok: false, error: "沒有建立內售出貨單的權限" };
  }
  if (!input.warehouse_id) return { ok: false, error: "缺出庫倉" };
  if (!input.notes?.trim()) return { ok: false, error: "請填寫用途說明" };
  if (!input.lines?.length) return { ok: false, error: "請至少加一筆料件" };
  for (const l of input.lines) {
    if (!l.item_id) return { ok: false, error: "明細缺料件" };
    if (!(l.qty_needed > 0)) return { ok: false, error: "明細數量需 > 0" };
    if (!(l.unit_price >= 0)) return { ok: false, error: "內部結算價不可為負" };
  }

  const previewRes = await previewRepairPick({
    mode: "adhoc",
    warehouse_id: input.warehouse_id,
    lines: input.lines.map((l) => ({ item_id: l.item_id, qty_needed: l.qty_needed })),
  });
  if (!previewRes.ok) return previewRes;
  if (!previewRes.data.can_post) {
    return { ok: false, error: "庫存不足，無法過帳（請看預覽紅色提示）" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data: { user } } = await supabase.auth.getUser();

  const persistRes = await persistPick({
    supabase,
    brandId: scope.brand_id,
    userId: user?.id ?? null,
    type: "internal_sale",
    warehouseId: input.warehouse_id,
    customerId: input.customer_id ?? null,
    roId: null,
    sourceDocType: null,
    sourceDocId: null,
    notes: input.notes.trim(),
    preview: previewRes.data,
    lineNotes: input.lines.map((l, i) => ({ line_no: i + 1, notes: l.line_notes ?? null })),
    linePrices: input.lines.map((l, i) => ({ line_no: i + 1, unit_price: Number(l.unit_price) })),
  });

  // 自動產會計分錄（PARTS_RETAIL_SALE）— 非阻塞、autoPost 直接 posted
  // POC 階段限制：整單聚合成一張 entry，item_id 取第一筆代表（多 item 拆分屬 engine v2）
  // SUBSIDIARY 軸由 engine normalizeSubsidiaryChain 自動從 warehouse_id 兩跳補
  if (persistRes.ok) {
    const giNo = persistRes.data.gi_no;
    const firstLine = previewRes.data.lines[0];
    const netAmount =
      Math.round(
        input.lines.reduce((s, l) => s + l.qty_needed * l.unit_price, 0) * 100,
      ) / 100;
    const taxAmount = Math.round(netAmount * 0.05 * 100) / 100;
    const costAmount =
      Math.round(
        previewRes.data.lines.reduce(
          (s, l) => s + l.picks.reduce((sp, p) => sp + p.qty * p.unit_cost, 0),
          0,
        ) * 100,
      ) / 100;
    if (firstLine && netAmount > 0 && costAmount > 0) {
      // 補 ctx 給 retail sale 用的 BRAND / DEPT / BANK 三軸
      // POC: 零售一律屬「零配件部」(PRT)；現金 BANK 用 CASH literal
      const brandId = scope.brand_id;
      const supabaseForDept = supabase;
      const { data: deptRow } = await supabaseForDept
        .from("departments")
        .select("id")
        .eq("brand_id", brandId)
        .eq("code", "PRT")
        .eq("is_active", true)
        .maybeSingle();
      after(async () => {
        const res = await instantiateTransaction(
          TX_TYPES.PARTS_RETAIL_SALE,
          {
            item_id: firstLine.item_id,
            customer_id: input.customer_id ?? null,
            warehouse_id: input.warehouse_id,
            net_amount: netAmount,
            tax_amount: taxAmount,
            cost_amount: costAmount,
            brand_id: brandId,
            dept_id: deptRow?.id ?? null,
            bank_id: "CASH",
          },
          { autoPost: true },
        );
        if (!res.ok) {
          console.error("[accounting] PARTS_RETAIL_SALE 自動過帳失敗", {
            gi_no: giNo,
            error: res.error,
          });
        } else {
          console.log("[accounting] PARTS_RETAIL_SALE 已自動過帳（posted）", {
            gi_no: giNo,
            journal_entry: res.data,
          });
        }
      });
    }
  }

  return persistRes;
}

// ─────────────────────────────────────────────────────────────
// 補貨需求（缺料時建單，原生進採購請購清單）
//
// Russell 6/18 確認四：補貨需求單必須出現在採購端「平常工作就會主動打開查看」
// 的清單裡。purchase_requisitions 的 source 約束本就含 'ro_shortage'（系統原生
// 設計「RO 缺料 → 請購」），因此改建一筆真正的 purchase_requisitions（source=
// 'ro_shortage'、status='submitted'、priority='urgent'）+ 逐缺料行 lines，
// 直接出現在 /parts/purchase/requisitions 採購日常清單，不需任何額外搜尋。
// （舊版存 stock_issues type='replenishment_request' 代理單、採購端從未顯示、形同孤兒，已棄用。）
// 回傳：req_no（REQ-{year}-{NNNN}）
// ─────────────────────────────────────────────────────────────

export type ReplenishmentRequestInput = {
  /** 觸發缺料的領料單 id（optional）*/
  issue_id?: string | null;
  /** 觸發缺料的工單 id（optional）*/
  work_order_id?: string | null;
  /** 工單 RO 號，for 顯示 */
  ro_no?: string | null;
  /** 倉庫 id */
  warehouse_id: string;
  /** 缺料明細 */
  shortage_lines: Array<{
    item_id: string;
    item_code: string | null;
    item_name: string;
    qty_shortage: number;
  }>;
};

export async function createReplenishmentRequest(
  input: ReplenishmentRequestInput,
): Promise<Result<{ req_no: string }>> {
  if (!(await hasPermission(PERMISSIONS.ISSUE_CREATE))) {
    return { ok: false, error: "沒有建立補貨需求的權限" };
  }
  if (!input.shortage_lines?.length) {
    return { ok: false, error: "缺料明細不可為空" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data: { user } } = await supabase.auth.getUser();

  // 產採購請購單號 REQ-{year}-{NNNN}（對齊 purchase_requisitions 既有規則）
  const year = new Date().getFullYear();
  const prefix = `REQ-${year}-`;
  const { data: recent } = await supabase
    .from("purchase_requisitions")
    .select("req_no")
    .eq("brand_id", scope.brand_id)
    .ilike("req_no", `${prefix}%`)
    .order("req_no", { ascending: false })
    .limit(50);
  let max = 0;
  for (const row of recent ?? []) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(row.req_no as string);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  const req_no = `${prefix}${String(max + 1).padStart(4, "0")}`;

  const shortageSummary = input.shortage_lines
    .map((l) => `${l.item_code ?? l.item_name} ×${l.qty_shortage}`)
    .join("、");

  // 主檔：source='ro_shortage'（系統原生「RO 缺料→請購」）、submitted（直接進採購待辦）、urgent
  const { data: req, error: reqErr } = await supabase
    .from("purchase_requisitions")
    .insert({
      brand_id: scope.brand_id,
      req_no,
      source: "ro_shortage",
      status: "submitted",
      priority: "urgent",
      notes: `部分出庫缺料自動請購｜工單：${input.ro_no ?? "—"}｜${shortageSummary}`,
      created_by: user?.id ?? null,
    })
    .select("id, req_no")
    .single();
  if (reqErr || !req) {
    return { ok: false, error: `建立補貨請購失敗：${reqErr?.message ?? "unknown"}` };
  }

  // 明細：逐缺料件一行
  const lineRows = input.shortage_lines.map((l, i) => ({
    brand_id: scope.brand_id,
    req_id: req.id,
    line_no: i + 1,
    item_id: l.item_id,
    qty_required: l.qty_shortage,
  }));
  const { error: lineErr } = await supabase
    .from("purchase_requisition_lines")
    .insert(lineRows);
  if (lineErr) {
    await supabase.from("purchase_requisitions").delete().eq("id", req.id);
    return { ok: false, error: `補貨請購明細建立失敗：${lineErr.message}` };
  }

  revalidatePath("/parts/purchase/requisitions");
  revalidatePath("/parts/issue/repair-pick");
  return { ok: true, data: { req_no } };
}

// ─────────────────────────────────────────────────────────────
// 取得工單的保固件清單（供 PreviewPanel / detail view 使用）
//
// 查 work_order_items.is_warranty=true 的料件，回傳 item_id 清單。
// ─────────────────────────────────────────────────────────────

export async function getWarrantyItemIdsByWorkOrder(
  work_order_id: string,
): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("work_order_items")
    .select("item_id")
    .eq("work_order_id", work_order_id)
    .eq("is_warranty", true)
    .eq("kind", "parts")
    .not("item_id", "is", null);
  return new Set((data ?? []).map((r) => r.item_id as string));
}

// ─────────────────────────────────────────────────────────────
// RO Addon 出庫（C-28）
//
// 專供 repair-order-actions hook#8（RO 關單）使用：一次消化該 RO 某一個倉的
// 所有 active addon 預留 → 走 persistPick 真扣 stock_items lots（FIFO）+ 認列 COGS。
// 每個 warehouse group 各建一張 stock_issue（source_doc_type='repair_order'）。
// 呼叫端負責冪等 check 與把 reservation 翻 consumed。
// stock_issues.ro_id 語意是 work_orders.id，C-28 刻意留 null，改用 source_doc_* 標記出處。
// ─────────────────────────────────────────────────────────────

export type AddonIssueLine = {
  item_id: string;
  qty_needed: number;
  reservation_id: string;
};

export async function pickForRepairOrderAddon(input: {
  warehouse_id: string;
  ro_id: string;
  ro_code: string;
  customer_id: string | null;
  lines: AddonIssueLine[];
}): Promise<Result<{ id: string; gi_no: string }>> {
  if (!(await hasPermission(PERMISSIONS.ISSUE_CREATE))) {
    return { ok: false, error: "沒有建立領料單的權限" };
  }
  if (!input.warehouse_id) return { ok: false, error: "缺出庫倉" };
  if (!input.lines?.length) return { ok: false, error: "沒有需出庫的 addon 零件" };

  const previewRes = await previewRepairPick({
    mode: "adhoc",
    warehouse_id: input.warehouse_id,
    lines: input.lines.map((l) => ({ item_id: l.item_id, qty_needed: l.qty_needed })),
  });
  if (!previewRes.ok) return previewRes;
  if (!previewRes.data.can_post) {
    return {
      ok: false,
      error: `RO ${input.ro_code} addon 出庫庫存不足（倉 ${input.warehouse_id}）`,
    };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return persistPick({
    supabase,
    brandId: scope.brand_id,
    userId: user?.id ?? null,
    type: "ro_picking",
    warehouseId: input.warehouse_id,
    customerId: input.customer_id,
    roId: null, // stock_issues.ro_id 語意是 work_orders.id，C-28 刻意留 null
    sourceDocType: "repair_order", // C-28 出庫的來源標記
    sourceDocId: input.ro_id, // repair_orders.id
    notes: `RO ${input.ro_code} 增項零件關單出庫（C-28）`,
    preview: previewRes.data,
    postCogs: true,
  });
}

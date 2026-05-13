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

  const [wRes, cRes, woRes] = await Promise.all([
    wIds.length > 0
      ? supabase.from("warehouses").select("id, name").in("id", wIds)
      : Promise.resolve({ data: [], error: null } as const),
    cIds.length > 0
      ? supabase.from("customers").select("id, name").in("id", cIds)
      : Promise.resolve({ data: [], error: null } as const),
    woIds.length > 0
      ? supabase.from("work_orders").select("id, ro_no").in("id", woIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name] as const));
  const cMap = new Map((cRes.data ?? []).map((c) => [c.id, c.name] as const));
  const woMap = new Map((woRes.data ?? []).map((w) => [w.id, w.ro_no] as const));

  return rs.map((r) => ({
    ...r,
    warehouse_name: r.warehouse_id ? wMap.get(r.warehouse_id) ?? null : null,
    customer_name: r.customer_id ? cMap.get(r.customer_id) ?? null : null,
    ro_no: r.ro_id ? woMap.get(r.ro_id) ?? null : null,
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

  const [itemsRes, binsRes] = await Promise.all([
    itemIds.length
      ? supabase.from("items").select("id, code, name").in("id", itemIds)
      : Promise.resolve({ data: [], error: null } as const),
    binIds.length
      ? supabase.from("warehouse_bins").select("id, code, name").in("id", binIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  const itemMap = new Map(
    (itemsRes.data ?? []).map((it) => [it.id, { code: it.code, name: it.name }] as const),
  );
  const binMap = new Map(
    (binsRes.data ?? []).map((b) => [b.id, b.code ?? b.name] as const),
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
  already_picked: boolean;
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

export async function getRepairPickFormData(): Promise<RepairPickFormData> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const [whRes, woRes, itemRes, issuedRes] = await Promise.all([
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
    supabase
      .from("stock_issues")
      .select("ro_id")
      .eq("brand_id", scope.brand_id)
      .eq("type", "repair_pick")
      .eq("status", "completed"),
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
  for (const it of woItemsRes.data ?? []) {
    const cur = partsAgg.get(it.work_order_id) ?? { qty: 0, count: 0 };
    cur.qty += Number(it.qty ?? 0);
    cur.count += 1;
    partsAgg.set(it.work_order_id, cur);
  }

  const cMap = new Map((cRes.data ?? []).map((c) => [c.id, c.name] as const));

  const pickedWoIds = new Set(
    (issuedRes.data ?? []).map((r) => r.ro_id).filter((x): x is string => !!x),
  );

  const workOrders: RepairPickWorkOrderCandidate[] = (woRes.data ?? [])
    .map((w) => {
      const agg = partsAgg.get(w.id) ?? { qty: 0, count: 0 };
      return {
        id: w.id,
        ro_no: w.ro_no,
        status: w.status,
        customer_name: w.customer_id ? cMap.get(w.customer_id) ?? null : null,
        parts_qty_total: agg.qty,
        parts_line_count: agg.count,
        already_picked: pickedWoIds.has(w.id),
      };
    })
    .filter((c) => c.parts_line_count > 0);

  return {
    warehouses: (whRes.data ?? []) as RepairPickWarehouse[],
    workOrders,
    items: (itemRes.data ?? []) as RepairPickItemPick[],
  };
}

export type RepairPickPreviewLine = {
  line_no: number;
  item_id: string;
  item_code: string | null;
  item_name: string;
  qty_needed: number;
  qty_available: number;
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

  if (input.mode === "ro") {
    if (!input.work_order_id) return { ok: false, error: "缺 work_order_id" };
    workOrderId = input.work_order_id;

    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, ro_no, status")
      .eq("id", input.work_order_id)
      .eq("brand_id", scope.brand_id)
      .maybeSingle();
    if (woErr) return { ok: false, error: woErr.message };
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

    needs = woItems
      .map((it) => ({
        item_id: it.item_id as string,
        qty_needed: Number(it.qty ?? 0),
        description: it.description ?? "",
      }))
      .filter((n) => n.qty_needed > 0);
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

    let remaining = n.qty_needed;
    const picks: RepairPickPreviewLine["picks"] = [];
    let qty_available = 0;
    let unit_cost_estimate = 0;
    for (const s of stocks ?? []) {
      qty_available += Number(s.qty);
      if (remaining <= 0) continue;
      const take = Math.min(Number(s.qty), remaining);
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
      unit_cost_estimate = uc;
    }

    const shortage = Math.max(0, n.qty_needed - (n.qty_needed - remaining));
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

export type CreateRepairPickInput = {
  work_order_id: string;
  warehouse_id: string;
  notes?: string;
};

export async function pickForWorkOrder(
  input: CreateRepairPickInput,
): Promise<Result<{ id: string; gi_no: string }>> {
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
  if (!previewRes.data.can_post) {
    return { ok: false, error: "庫存不足，無法過帳（請看預覽紅色提示）" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: wo } = await supabase
    .from("work_orders")
    .select("id, ro_no, customer_id")
    .eq("id", input.work_order_id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!wo) return { ok: false, error: "找不到工單" };

  return persistPick({
    supabase,
    brandId: scope.brand_id,
    userId: user?.id ?? null,
    type: "repair_pick",
    warehouseId: input.warehouse_id,
    customerId: wo.customer_id ?? null,
    roId: wo.id,
    sourceDocType: "work_order",
    sourceDocId: wo.id,
    notes: input.notes ?? `RO ${wo.ro_no} 一鍵領料`,
    preview: previewRes.data,
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
): Promise<Result<{ id: string; gi_no: string }>> {
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
  if (!previewRes.data.can_post) {
    return { ok: false, error: "庫存不足，無法過帳（請看預覽紅色提示）" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data: { user } } = await supabase.auth.getUser();

  return persistPick({
    supabase,
    brandId: scope.brand_id,
    userId: user?.id ?? null,
    type: "repair_pick",
    warehouseId: input.warehouse_id,
    customerId: input.customer_id ?? null,
    roId: null,
    sourceDocType: null,
    sourceDocId: null,
    notes: input.notes.trim(),
    preview: previewRes.data,
    lineNotes: input.lines.map((l, i) => ({ line_no: i + 1, notes: l.line_notes ?? null })),
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
}): Promise<Result<{ id: string; gi_no: string }>> {
  const { supabase, brandId, userId, type, warehouseId, customerId, roId, sourceDocType, sourceDocId, notes, preview, lineNotes, linePrices } = args;

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

  revalidatePath("/parts/issue/repair-pick");
  revalidatePath("/parts/operations/balance");
  if (sourceDocId) revalidatePath(`/admin/master-data/work-orders/${sourceDocId}`);
  return { ok: true, data: { id: issue.id, gi_no } };
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

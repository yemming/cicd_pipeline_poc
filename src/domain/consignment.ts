"use server";

/**
 * Domain Helper — Consignment Stocks（寄存管理）
 *
 * 規格：docs/proposals/feature-operations-consignment-2026-05-13.md
 *
 * Queries：
 *   - listConsignments(filter)            → 列表（join supplier/item/warehouse）
 *   - getConsignmentStats()               → 4 個 KPI 卡
 *   - getConsignmentLookup()              → 下拉資料
 *   - getConsignmentPageData(filter)      → list + stats + canEdit + lookups
 *   - getConsignmentById(id)              → Detail page（單筆 + stock_items + events）
 *   - getNewConsignmentFormData()         → /new 表單下拉
 *
 * Actions：
 *   - registerConsignmentAction(input)    → 登錄寄存（同步建 stock_items + 寫 audit）
 *   - transferConsignmentInAction(id)     → 確認轉入正式庫存（PARTS_PURCHASE 自動過帳 + audit）
 *   - returnConsignmentAction(id, reason) → 退還給供應商（刪 stock_items + audit）
 */

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { instantiateTransaction, TX_TYPES } from "@/domain/transactions";

import type { Database, Json } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type ConsignmentRow = Tables["consignment_stocks"]["Row"];

export type ConsignmentListRow = ConsignmentRow & {
  supplier_name: string | null;
  item_code: string | null;
  item_name: string | null;
  warehouse_name: string | null;
  days_remaining: number;
  due_bucket: "expired" | "near" | "ok" | "done";
};

export type ConsignmentStats = {
  active_count: number;
  active_suppliers: number;
  near_due_count: number;
  expired_count: number;
  transferred_this_month_count: number;
  transferred_this_month_amount: number;
};

export type ConsignmentLookup = {
  suppliers: { id: string; name: string }[];
  warehouses: { id: string; code: string; name: string }[];
  items: { id: string; code: string | null; name: string }[];
};

export type ConsignmentStockItemRow = {
  id: string;
  qty: number;
  unit_cost: number | null;
  status: string;
  bin_id: string | null;
  serial_no: string | null;
  batch_no: string | null;
  last_movement_at: string | null;
  notes: string | null;
};

export type ConsignmentMovementRow = {
  id: string;
  direction: "in" | "out";
  qty: number;
  reason: string;
  source_table: string;
  source_id: string | null;
  created_at: string;
  created_by: string | null;
  metadata: Json | null;
};

export type ConsignmentDetail = {
  con: ConsignmentListRow;
  stockItems: ConsignmentStockItemRow[];
  events: ConsignmentMovementRow[];
};

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────

function bucketFor(row: { end_date: string; status: string }, today: Date): {
  days_remaining: number;
  due_bucket: "expired" | "near" | "ok" | "done";
} {
  if (
    row.status === "transferred" ||
    row.status === "partial" ||
    row.status === "returned"
  ) {
    return { days_remaining: 0, due_bucket: "done" };
  }
  const end = new Date(row.end_date + "T00:00:00");
  const t0 = new Date(today.toISOString().slice(0, 10) + "T00:00:00");
  const diff = Math.round((end.getTime() - t0.getTime()) / 86_400_000);
  if (diff < 0) return { days_remaining: diff, due_bucket: "expired" };
  if (diff <= 7) return { days_remaining: diff, due_bucket: "near" };
  return { days_remaining: diff, due_bucket: "ok" };
}

export async function listConsignments(
  filter: {
    status?: string;
    bucket?: "all" | "active" | "near" | "expired" | "done";
    supplier_id?: string;
    due_from?: string;
    due_to?: string;
    q?: string;
  } = {},
): Promise<ConsignmentListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("consignment_stocks")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("end_date", { ascending: true })
    .limit(500);

  if (filter.status) q = q.eq("status", filter.status);
  if (filter.supplier_id) q = q.eq("supplier_id", filter.supplier_id);
  if (filter.due_from) q = q.gte("end_date", filter.due_from);
  if (filter.due_to) q = q.lte("end_date", filter.due_to);

  const { data: cs, error } = await q;
  if (error) throw error;
  if (!cs || cs.length === 0) return [];

  const sIds = Array.from(
    new Set(cs.map((c) => c.supplier_id).filter((x): x is string => !!x)),
  );
  const iIds = Array.from(
    new Set(cs.map((c) => c.item_id).filter((x): x is string => !!x)),
  );
  const wIds = Array.from(
    new Set(cs.map((c) => c.warehouse_id).filter((x): x is string => !!x)),
  );

  const [sRes, iRes, wRes] = await Promise.all([
    sIds.length > 0
      ? supabase.from("suppliers").select("id, name").in("id", sIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    iIds.length > 0
      ? supabase.from("items").select("id, code, name").in("id", iIds)
      : Promise.resolve({
          data: [] as { id: string; code: string | null; name: string | null }[],
          error: null,
        }),
    wIds.length > 0
      ? supabase.from("warehouses").select("id, name").in("id", wIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);
  if (sRes.error) throw sRes.error;
  if (iRes.error) throw iRes.error;
  if (wRes.error) throw wRes.error;
  const sMap = new Map((sRes.data ?? []).map((s) => [s.id, s.name]));
  const iMap = new Map(
    (iRes.data ?? []).map((i) => [
      i.id,
      { code: i.code ?? "", name: i.name ?? "" },
    ]),
  );
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  const today = new Date();
  let rows: ConsignmentListRow[] = cs.map((c) => {
    const item = c.item_id ? iMap.get(c.item_id) : null;
    const { days_remaining, due_bucket } = bucketFor(c, today);
    return {
      ...c,
      supplier_name: c.supplier_id ? sMap.get(c.supplier_id) ?? null : null,
      item_code: item?.code ?? null,
      item_name: item?.name ?? null,
      warehouse_name: c.warehouse_id ? wMap.get(c.warehouse_id) ?? null : null,
      days_remaining,
      due_bucket,
    };
  });

  if (filter.bucket && filter.bucket !== "all") {
    if (filter.bucket === "active") {
      rows = rows.filter((r) => r.status === "active");
    } else if (filter.bucket === "near") {
      rows = rows.filter((r) => r.due_bucket === "near");
    } else if (filter.bucket === "expired") {
      rows = rows.filter((r) => r.due_bucket === "expired");
    } else if (filter.bucket === "done") {
      rows = rows.filter(
        (r) => r.status === "transferred" || r.status === "partial",
      );
    }
  }
  if (filter.q) {
    const kw = filter.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.con_no ?? "").toLowerCase().includes(kw) ||
        (r.item_code ?? "").toLowerCase().includes(kw) ||
        (r.item_name ?? "").toLowerCase().includes(kw),
    );
  }
  return rows;
}

export async function getConsignmentStats(): Promise<ConsignmentStats> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const todayIso = new Date().toISOString().slice(0, 10);
  const monthStart = todayIso.slice(0, 7) + "-01";
  const sevenDaysLater = new Date(Date.now() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data: actives } = await supabase
    .from("consignment_stocks")
    .select("supplier_id, end_date")
    .eq("brand_id", scope.brand_id)
    .eq("status", "active");
  const activeRows = actives ?? [];
  const active_count = activeRows.length;
  const active_suppliers = new Set(
    activeRows.map((r) => r.supplier_id).filter((x): x is string => !!x),
  ).size;
  const near_due_count = activeRows.filter(
    (r) => r.end_date >= todayIso && r.end_date <= sevenDaysLater,
  ).length;
  const expired_count = activeRows.filter((r) => r.end_date < todayIso).length;

  const { data: transferred } = await supabase
    .from("consignment_stocks")
    .select("transferred_qty, unit_cost, transferred_at")
    .eq("brand_id", scope.brand_id)
    .gte("transferred_at", monthStart);
  const trows = transferred ?? [];
  const transferred_this_month_count = trows.reduce(
    (s, r) => s + Number(r.transferred_qty ?? 0),
    0,
  );
  const transferred_this_month_amount = trows.reduce(
    (s, r) =>
      s + Number(r.transferred_qty ?? 0) * Number(r.unit_cost ?? 0),
    0,
  );

  return {
    active_count,
    active_suppliers,
    near_due_count,
    expired_count,
    transferred_this_month_count,
    transferred_this_month_amount,
  };
}

export async function getConsignmentLookup(): Promise<ConsignmentLookup> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const [sRes, wRes, iRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(200),
    supabase
      .from("warehouses")
      .select("id, code, name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(100),
    supabase
      .from("items")
      .select("id, code, name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code", { ascending: true })
      .limit(500),
  ]);

  return {
    suppliers: (sRes.data ?? []).map((s) => ({ id: s.id, name: s.name })),
    warehouses: (wRes.data ?? []).map((w) => ({
      id: w.id,
      code: w.code ?? "",
      name: w.name,
    })),
    items: (iRes.data ?? []).map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name ?? "",
    })),
  };
}

export async function getConsignmentPageData(
  filter: {
    status?: string;
    bucket?: "all" | "active" | "near" | "expired" | "done";
    supplier_id?: string;
    due_from?: string;
    due_to?: string;
    q?: string;
  } = {},
): Promise<{
  rows: ConsignmentListRow[];
  stats: ConsignmentStats;
  lookup: ConsignmentLookup;
  canEdit: boolean;
}> {
  const [rows, stats, lookup, canEdit] = await Promise.all([
    listConsignments(filter),
    getConsignmentStats(),
    getConsignmentLookup(),
    hasPermission(PERMISSIONS.CONSIGNMENT_OPS),
  ]);
  return { rows, stats, lookup, canEdit };
}

/**
 * /new 表單只需要 lookup（reuse getConsignmentLookup）
 */
export async function getNewConsignmentFormData(): Promise<ConsignmentLookup> {
  return getConsignmentLookup();
}

/**
 * Detail page 用：撈單筆 + 對應 stock_items（FK join）+ stock_movements audit trail
 */
export async function getConsignmentById(
  id: string,
): Promise<ConsignmentDetail | null> {
  if (!id) return null;
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: con, error: cErr } = await supabase
    .from("consignment_stocks")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .eq("id", id)
    .maybeSingle();
  if (cErr || !con) return null;

  // 補 supplier / item / warehouse 名稱 + bucket
  const [sRes, iRes, wRes] = await Promise.all([
    con.supplier_id
      ? supabase
          .from("suppliers")
          .select("name")
          .eq("id", con.supplier_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    con.item_id
      ? supabase
          .from("items")
          .select("code, name")
          .eq("id", con.item_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    con.warehouse_id
      ? supabase
          .from("warehouses")
          .select("name")
          .eq("id", con.warehouse_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const { days_remaining, due_bucket } = bucketFor(con, new Date());
  const conRow: ConsignmentListRow = {
    ...con,
    supplier_name: sRes.data?.name ?? null,
    item_code: iRes.data?.code ?? null,
    item_name: iRes.data?.name ?? null,
    warehouse_name: wRes.data?.name ?? null,
    days_remaining,
    due_bucket,
  };

  // stock_items via FK
  const { data: siData } = await supabase
    .from("stock_items")
    .select(
      "id, qty, unit_cost, status, bin_id, serial_no, batch_no, last_movement_at, notes",
    )
    .eq("brand_id", scope.brand_id)
    .eq("consignment_id", id);

  const stockItems: ConsignmentStockItemRow[] = (siData ?? []).map((s) => ({
    id: s.id,
    qty: Number(s.qty ?? 0),
    unit_cost: s.unit_cost == null ? null : Number(s.unit_cost),
    status: s.status,
    bin_id: s.bin_id,
    serial_no: s.serial_no,
    batch_no: s.batch_no,
    last_movement_at: s.last_movement_at,
    notes: s.notes,
  }));

  // stock_movements audit
  const { data: mvData } = await supabase
    .from("stock_movements")
    .select(
      "id, direction, qty, reason, source_table, source_id, created_at, created_by, metadata",
    )
    .eq("brand_id", scope.brand_id)
    .eq("source_table", "consignment_stocks")
    .eq("source_id", id)
    .order("created_at", { ascending: false });

  const events: ConsignmentMovementRow[] = (mvData ?? []).map((m) => ({
    id: m.id,
    direction: m.direction as "in" | "out",
    qty: Number(m.qty ?? 0),
    reason: m.reason,
    source_table: m.source_table,
    source_id: m.source_id,
    created_at: m.created_at,
    created_by: m.created_by,
    metadata: m.metadata,
  }));

  return { con: conRow, stockItems, events };
}

// ────────────────────────────────────────────────────────────
// Actions
// ────────────────────────────────────────────────────────────

export type RegisterConsignmentInput = {
  supplier_id: string;
  item_id: string;
  warehouse_id: string;
  bin_id?: string | null;
  initial_qty: number;
  unit_cost: number; // Q6=a：改必填
  start_date: string;
  end_date: string;
  notes?: string;
};

export async function registerConsignmentAction(
  input: RegisterConsignmentInput,
): Promise<ActionResult<{ con_id: string; con_no: string }>> {
  if (!(await hasPermission(PERMISSIONS.CONSIGNMENT_OPS))) {
    return { ok: false, error: "沒有寄存管理權限" };
  }
  if (!input.supplier_id) return { ok: false, error: "供應商必選" };
  if (!input.item_id) return { ok: false, error: "料件必選" };
  if (!input.warehouse_id) return { ok: false, error: "倉庫必選" };
  if (!(input.initial_qty > 0)) return { ok: false, error: "數量需 > 0" };
  if (!(input.unit_cost > 0)) return { ok: false, error: "單價需 > 0" };
  if (!input.start_date || !input.end_date)
    return { ok: false, error: "起迄日必填" };
  if (input.end_date < input.start_date)
    return { ok: false, error: "到期日不可早於起始日" };

  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;
  const { userId } = await getCurrentUserAndAdmin();

  // 產 con_no
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const { data: lastCon } = await supabase
    .from("consignment_stocks")
    .select("con_no")
    .eq("brand_id", brandId)
    .like("con_no", `CON${dateStr}-%`)
    .order("con_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (lastCon?.con_no) {
    const m = lastCon.con_no.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  const con_no = `CON${dateStr}-${String(seq).padStart(3, "0")}`;

  const { data: con, error: conErr } = await supabase
    .from("consignment_stocks")
    .insert({
      brand_id: brandId,
      con_no,
      supplier_id: input.supplier_id,
      item_id: input.item_id,
      warehouse_id: input.warehouse_id,
      bin_id: input.bin_id ?? null,
      initial_qty: input.initial_qty,
      remaining_qty: input.initial_qty,
      unit_cost: input.unit_cost,
      start_date: input.start_date,
      end_date: input.end_date,
      status: "active",
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (conErr) {
    if (conErr.code === "23505")
      return { ok: false, error: `寄存單號 ${con_no} 重複（請稍候重試）` };
    return { ok: false, error: `建寄存單失敗：${conErr.message}` };
  }

  // 同步 stock_items（status='consignment'、consignment_id FK）
  const { error: siErr } = await supabase.from("stock_items").insert({
    brand_id: brandId,
    item_id: input.item_id,
    warehouse_id: input.warehouse_id,
    bin_id: input.bin_id ?? null,
    qty: input.initial_qty,
    unit_cost: input.unit_cost,
    status: "consignment",
    consignment_id: con.id,
    notes: `寄存 ${con_no}`,
  });
  if (siErr) {
    return { ok: false, error: `建寄存品庫存行失敗：${siErr.message}` };
  }

  revalidatePath("/parts/operations/consignment");
  revalidatePath("/parts/operations/balance");

  // 視需要將來補 audit；register 不算庫存異動（提案 §4 已說明）
  void userId; // unused

  return { ok: true, data: { con_id: con.id, con_no } };
}

export async function transferConsignmentInAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.CONSIGNMENT_OPS))) {
    return { ok: false, error: "沒有寄存管理權限" };
  }
  if (!id) return { ok: false, error: "缺寄存單 id" };

  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;
  const { userId } = await getCurrentUserAndAdmin();

  const { data: con, error: rErr } = await supabase
    .from("consignment_stocks")
    .select("*")
    .eq("brand_id", brandId)
    .eq("id", id)
    .maybeSingle();
  if (rErr || !con) return { ok: false, error: "找不到寄存單" };
  if (con.status === "transferred" || con.status === "returned") {
    return { ok: false, error: `此寄存單已 ${con.status}，不可重複處理` };
  }

  const remain = Number(con.remaining_qty ?? 0);
  if (!(remain > 0)) return { ok: false, error: "剩餘數量為 0，無法轉入" };

  // 1) 把對應的 stock_items 行從 'consignment' → 'available'（用 FK）
  const { error: siErr } = await supabase
    .from("stock_items")
    .update({ status: "available", notes: `轉入自寄存 ${con.con_no}` })
    .eq("brand_id", brandId)
    .eq("consignment_id", con.id)
    .eq("status", "consignment");
  if (siErr) return { ok: false, error: `更新 stock_items 失敗：${siErr.message}` };

  // 2) 更新 consignment_stocks
  const { error: uErr } = await supabase
    .from("consignment_stocks")
    .update({
      transferred_qty: Number(con.transferred_qty ?? 0) + remain,
      remaining_qty: 0,
      status: "transferred",
      transferred_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (uErr) return { ok: false, error: `更新寄存單失敗：${uErr.message}` };

  // 3) audit：寫 stock_movements（direction='in'，寄存轉購視為一筆進倉動作）
  await supabase.from("stock_movements").insert({
    brand_id: brandId,
    item_id: con.item_id,
    warehouse_id: con.warehouse_id,
    direction: "in",
    qty: remain,
    reason: "寄存轉購",
    source_table: "consignment_stocks",
    source_id: con.id,
    created_by: userId ?? null,
    metadata: { con_no: con.con_no } as unknown as Json,
  });

  revalidatePath("/parts/operations/consignment");
  revalidatePath("/parts/operations/balance");
  revalidatePath(`/parts/operations/consignment/${id}`);

  // 4) 接會計 engine（PARTS_PURCHASE，autoPost、tax=0 — Q3.b=b1）
  const unitCost = Number(con.unit_cost ?? 0);
  const netAmount = unitCost * remain;
  if (netAmount > 0 && con.supplier_id && con.item_id) {
    after(async () => {
      const res = await instantiateTransaction(
        TX_TYPES.PARTS_PURCHASE,
        {
          supplier_id: con.supplier_id as string,
          item_id: con.item_id as string,
          net_amount: netAmount,
          tax_amount: 0, // Q3.b=b1：寄存轉購時供應商另開發票才處理稅
          warehouse_id: con.warehouse_id,
          store_id: null,
        },
        { autoPost: true, userId: userId ?? undefined },
      );
      if (!res.ok) {
        console.error("[accounting] 寄存轉購 PARTS_PURCHASE 過帳失敗", {
          con_no: con.con_no,
          error: res.error,
        });
      } else {
        console.log("[accounting] 寄存轉購 PARTS_PURCHASE 已過帳（posted）", {
          con_no: con.con_no,
          journal_entry: res.data,
        });
      }
    });
  } else {
    console.warn("[accounting] 寄存轉購跳過過帳（無單價或缺供應商/料件）", {
      con_no: con.con_no,
      unitCost,
      remain,
    });
  }

  return { ok: true, data: { id } };
}

export async function returnConsignmentAction(
  id: string,
  reason?: string,
): Promise<ActionResult<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.CONSIGNMENT_OPS))) {
    return { ok: false, error: "沒有寄存管理權限" };
  }
  if (!id) return { ok: false, error: "缺寄存單 id" };

  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;
  const { userId } = await getCurrentUserAndAdmin();

  const { data: con, error: rErr } = await supabase
    .from("consignment_stocks")
    .select("*")
    .eq("brand_id", brandId)
    .eq("id", id)
    .maybeSingle();
  if (rErr || !con) return { ok: false, error: "找不到寄存單" };
  if (con.status === "transferred" || con.status === "returned") {
    return { ok: false, error: `此寄存單已 ${con.status}，不可重複處理` };
  }

  const remain = Number(con.remaining_qty ?? 0);

  // 1) 刪掉相應的 stock_items 行（依 FK）
  const { error: siErr } = await supabase
    .from("stock_items")
    .delete()
    .eq("brand_id", brandId)
    .eq("consignment_id", con.id)
    .eq("status", "consignment");
  if (siErr) return { ok: false, error: `刪除 stock_items 失敗：${siErr.message}` };

  // 2) 更新 consignment_stocks：remaining=0、status='returned'、metadata.return_reason
  const meta: Record<string, unknown> = {
    ...((con.metadata as Record<string, unknown> | null) ?? {}),
  };
  if (reason && reason.trim()) meta.return_reason = reason.trim();
  meta.returned_at = new Date().toISOString();

  const { error: uErr } = await supabase
    .from("consignment_stocks")
    .update({
      remaining_qty: 0,
      status: "returned",
      metadata: meta as unknown as Json,
    })
    .eq("id", id);
  if (uErr) return { ok: false, error: `更新寄存單失敗：${uErr.message}` };

  // 3) audit：寫 stock_movements（direction='out'，退還寄存）
  if (remain > 0 && con.item_id && con.warehouse_id) {
    await supabase.from("stock_movements").insert({
      brand_id: brandId,
      item_id: con.item_id,
      warehouse_id: con.warehouse_id,
      direction: "out",
      qty: remain,
      reason: reason && reason.trim() ? `退還寄存：${reason.trim()}` : "退還寄存",
      source_table: "consignment_stocks",
      source_id: con.id,
      created_by: userId ?? null,
      metadata: { con_no: con.con_no } as unknown as Json,
    });
  }

  revalidatePath("/parts/operations/consignment");
  revalidatePath("/parts/operations/balance");
  revalidatePath(`/parts/operations/consignment/${id}`);
  return { ok: true, data: { id } };
}

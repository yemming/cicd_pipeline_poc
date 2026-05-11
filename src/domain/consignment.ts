"use server";

/**
 * Domain Helper — Consignment Stocks（寄存管理）
 *
 * 規格：docs/DUCATI_庫存管理模組_串接版_20260510_最新版/07_庫存作業_寄存管理.html
 *
 * 三件套：
 *   - listConsignments(filter)            → 列表（join supplier/item/warehouse）
 *   - getConsignmentStats()               → 4 個 KPI 卡
 *   - getConsignmentPageData(filter)      → list + stats + canEdit + lookups
 *
 * 三個寫入 action：
 *   - registerConsignmentAction(input)    → 登錄寄存
 *   - transferConsignmentInAction(id)     → 確認轉入正式庫存（移 stock_items.status 從 'consignment' → 'available'）
 *   - returnConsignmentAction(id, reason) → 退還給供應商（軟性結案，stock_items 行刪除）
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database, Json } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type ConsignmentRow = Tables["consignment_stocks"]["Row"];

export type ConsignmentListRow = ConsignmentRow & {
  supplier_name: string | null;
  item_code: string | null;
  item_name: string | null;
  warehouse_name: string | null;
  days_remaining: number; // 規格的 "剩餘天數"；負數 = 已過期
  due_bucket: "expired" | "near" | "ok" | "done"; // 規格 4 種 pill 色
};

export type ConsignmentStats = {
  active_count: number; // 寄存中品項
  active_suppliers: number; // 共 N 家供應商
  near_due_count: number; // 即將到期（≤7 天）
  expired_count: number; // 已過期未處理
  transferred_this_month_count: number; // 本月已轉入正式庫存（件數）
  transferred_this_month_amount: number; // 本月已轉入金額
};

export type ConsignmentLookup = {
  suppliers: { id: string; name: string }[];
  warehouses: { id: string; code: string; name: string }[];
  items: { id: string; code: string | null; name: string }[];
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

  // 客戶端 filter：bucket pill / 關鍵字（跨 con_no/item_code/item_name）
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

  // 寄存中 + 4 家供應商
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

  // 本月轉入：transferred_at >= monthStart 且 status in transferred/partial
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

// ────────────────────────────────────────────────────────────
// Actions
// ────────────────────────────────────────────────────────────

export type RegisterConsignmentInput = {
  supplier_id: string;
  item_id: string;
  warehouse_id: string;
  bin_id?: string | null;
  initial_qty: number;
  unit_cost?: number;
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
  if (!input.start_date || !input.end_date)
    return { ok: false, error: "起迄日必填" };
  if (input.end_date < input.start_date)
    return { ok: false, error: "到期日不可早於起始日" };

  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;

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
      unit_cost: input.unit_cost ?? null,
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

  // 同步 stock_items（status='consignment'，不計入可用庫存）
  await supabase.from("stock_items").insert({
    brand_id: brandId,
    item_id: input.item_id,
    warehouse_id: input.warehouse_id,
    bin_id: input.bin_id ?? null,
    qty: input.initial_qty,
    unit_cost: input.unit_cost ?? 0,
    status: "consignment",
    notes: `寄存 ${con_no}`,
  });

  revalidatePath("/parts/operations/consignment");
  revalidatePath("/parts/operations/balance");
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

  // 1) 把對應的 stock_items 行從 'consignment' → 'available'
  await supabase
    .from("stock_items")
    .update({ status: "available", notes: `轉入自寄存 ${con.con_no}` })
    .eq("brand_id", brandId)
    .eq("item_id", con.item_id)
    .eq("warehouse_id", con.warehouse_id)
    .eq("status", "consignment")
    .ilike("notes", `寄存 ${con.con_no}%`);

  // 2) 更新 consignment_stocks：transferred_qty += remain、remaining=0、status='transferred'
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

  revalidatePath("/parts/operations/consignment");
  revalidatePath("/parts/operations/balance");
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

  // 1) 刪掉相應的 stock_items 行（寄存品退還，倉內庫存物理消失）
  await supabase
    .from("stock_items")
    .delete()
    .eq("brand_id", brandId)
    .eq("item_id", con.item_id)
    .eq("warehouse_id", con.warehouse_id)
    .eq("status", "consignment")
    .ilike("notes", `寄存 ${con.con_no}%`);

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

  revalidatePath("/parts/operations/consignment");
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { id } };
}

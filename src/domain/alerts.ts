"use server";

/**
 * Domain Helper — Stock Thresholds & Alerts（庫存水位設定 / 告警）
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type StockThresholdRow = Tables["stock_thresholds"]["Row"];

export type ThresholdListRow = StockThresholdRow & {
  item_code: string | null;
  item_name: string | null;
  warehouse_name: string | null;
};

export type WarehouseLookup = { id: string; name: string; code: string };
export type ItemLookup = { id: string; name: string; code: string };

type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function listThresholds(filter: {
  abc_class?: string;
  q?: string;
  warehouse_id?: string;
  priority?: string;
  is_active?: boolean;
} = {}): Promise<ThresholdListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("stock_thresholds")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (filter.abc_class) q = q.eq("abc_class", filter.abc_class);
  if (filter.warehouse_id) q = q.eq("warehouse_id", filter.warehouse_id);
  if (filter.priority) q = q.eq("alert_priority", filter.priority);
  if (filter.is_active !== undefined) q = q.eq("is_active", filter.is_active);
  const { data: ts, error } = await q;
  if (error) throw error;
  if (!ts || ts.length === 0) return [];

  const iIds = Array.from(new Set(ts.map((t) => t.item_id).filter((x): x is string => !!x)));
  const wIds = Array.from(new Set(ts.map((t) => t.warehouse_id).filter((x): x is string => !!x)));

  const [iRes, wRes] = await Promise.all([
    iIds.length > 0
      ? supabase.from("items").select("id, code, name").in("id", iIds)
      : Promise.resolve({ data: [], error: null }),
    wIds.length > 0
      ? supabase.from("warehouses").select("id, name").in("id", wIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (iRes.error) throw iRes.error;
  if (wRes.error) throw wRes.error;
  const iMap = new Map(
    (iRes.data ?? []).map((i) => [i.id, { code: i.code ?? "", name: i.name ?? "" }]),
  );
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  let rows = ts.map((t) => {
    const item = t.item_id ? iMap.get(t.item_id) : null;
    return {
      ...t,
      item_code: item?.code ?? null,
      item_name: item?.name ?? null,
      warehouse_name: t.warehouse_id ? wMap.get(t.warehouse_id) ?? null : null,
    };
  });
  if (filter.q) {
    const ql = filter.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.item_code ?? "").toLowerCase().includes(ql) ||
        (r.item_name ?? "").toLowerCase().includes(ql),
    );
  }
  return rows;
}

async function listWarehouseLookup(): Promise<WarehouseLookup[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("warehouses")
    .select("id, name, code")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true)
    .order("code", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((w) => ({
    id: w.id,
    name: w.name ?? "",
    code: w.code ?? "",
  }));
}

async function listItemLookup(): Promise<ItemLookup[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("items")
    .select("id, name, code")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true)
    .order("code", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((i) => ({
    id: i.id,
    name: i.name ?? "",
    code: i.code ?? "",
  }));
}

export async function getThresholdsPageData(filter: {
  abc_class?: string;
  q?: string;
  warehouse_id?: string;
  priority?: string;
  is_active?: boolean;
} = {}): Promise<{
  rows: ThresholdListRow[];
  warehouses: WarehouseLookup[];
  canEdit: boolean;
}> {
  const [rows, warehouses, canEdit] = await Promise.all([
    listThresholds(filter),
    listWarehouseLookup(),
    hasPermission(PERMISSIONS.ALERT_CONFIG),
  ]);
  return { rows, warehouses, canEdit };
}

export async function getThresholdById(id: string): Promise<{
  row: ThresholdListRow;
  warehouses: WarehouseLookup[];
  canEdit: boolean;
} | null> {
  if (!id) return null;
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: t, error } = await supabase
    .from("stock_thresholds")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (error) throw error;
  if (!t) return null;

  const [iRes, wRes, warehouses, canEdit] = await Promise.all([
    t.item_id
      ? supabase.from("items").select("id, code, name").eq("id", t.item_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    t.warehouse_id
      ? supabase.from("warehouses").select("id, name").eq("id", t.warehouse_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    listWarehouseLookup(),
    hasPermission(PERMISSIONS.ALERT_CONFIG),
  ]);
  if (iRes && "error" in iRes && iRes.error) throw iRes.error;
  if (wRes && "error" in wRes && wRes.error) throw wRes.error;

  return {
    row: {
      ...t,
      item_code: (iRes.data as { code?: string } | null)?.code ?? null,
      item_name: (iRes.data as { name?: string } | null)?.name ?? null,
      warehouse_name: (wRes.data as { name?: string } | null)?.name ?? null,
    },
    warehouses,
    canEdit,
  };
}

export async function getNewThresholdFormData(): Promise<{
  warehouses: WarehouseLookup[];
  items: ItemLookup[];
  canEdit: boolean;
}> {
  const [warehouses, items, canEdit] = await Promise.all([
    listWarehouseLookup(),
    listItemLookup(),
    hasPermission(PERMISSIONS.ALERT_CONFIG),
  ]);
  return { warehouses, items, canEdit };
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

export type ThresholdInput = {
  warehouse_id: string;
  item_id: string;
  min_stock: number;
  safety_stock?: number;
  reorder_point: number;
  max_stock?: number | null;
  abc_class?: "A" | "B" | "C" | null;
  alert_priority?: "low" | "medium" | "high" | "critical";
};

export async function createThresholdAction(
  input: ThresholdInput,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  if (!input.warehouse_id || !input.item_id) {
    return { ok: false, error: "倉庫 / 料件必選" };
  }
  if (input.min_stock < 0 || input.reorder_point < 0) {
    return { ok: false, error: "min / reorder 不可為負" };
  }
  if (input.max_stock != null && input.max_stock < input.reorder_point) {
    return { ok: false, error: "最高水位不可低於再訂購點" };
  }

  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;

  const { data, error } = await supabase
    .from("stock_thresholds")
    .upsert(
      {
        brand_id: brandId,
        warehouse_id: input.warehouse_id,
        item_id: input.item_id,
        min_stock: input.min_stock,
        safety_stock: input.safety_stock ?? input.min_stock,
        reorder_point: input.reorder_point,
        max_stock: input.max_stock ?? null,
        abc_class: input.abc_class ?? null,
        alert_priority: input.alert_priority ?? "medium",
        is_active: true,
      },
      { onConflict: "warehouse_id,item_id" },
    )
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "此倉庫 + 料件已存在水位設定" };
    }
    return { ok: false, error: `寫入水位失敗：${error.message}` };
  }

  revalidatePath("/parts/alerts/thresholds");
  return { ok: true, data: { id: data.id } };
}

export type ThresholdPatch = {
  warehouse_id?: string;
  item_id?: string;
  min_stock?: number;
  safety_stock?: number;
  reorder_point?: number;
  max_stock?: number | null;
  abc_class?: "A" | "B" | "C" | null;
  alert_priority?: "low" | "medium" | "high" | "critical";
};

export async function updateThresholdAction(
  id: string,
  patch: ThresholdPatch,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const updates: Record<string, unknown> = {};
  if (patch.warehouse_id !== undefined) {
    if (!patch.warehouse_id) return { ok: false, error: "倉庫必選" };
    updates.warehouse_id = patch.warehouse_id;
  }
  if (patch.item_id !== undefined) {
    if (!patch.item_id) return { ok: false, error: "料件必選" };
    updates.item_id = patch.item_id;
  }
  if (patch.min_stock !== undefined) {
    if (patch.min_stock < 0) return { ok: false, error: "min 不可為負" };
    updates.min_stock = patch.min_stock;
  }
  if (patch.safety_stock !== undefined) {
    if (patch.safety_stock < 0) return { ok: false, error: "safety 不可為負" };
    updates.safety_stock = patch.safety_stock;
  }
  if (patch.reorder_point !== undefined) {
    if (patch.reorder_point < 0) return { ok: false, error: "reorder 不可為負" };
    updates.reorder_point = patch.reorder_point;
  }
  if (patch.max_stock !== undefined) {
    if (patch.max_stock != null && patch.max_stock < 0) {
      return { ok: false, error: "max 不可為負" };
    }
    updates.max_stock = patch.max_stock;
  }
  if (patch.abc_class !== undefined) updates.abc_class = patch.abc_class;
  if (patch.alert_priority !== undefined) updates.alert_priority = patch.alert_priority;

  if (Object.keys(updates).length === 0) {
    return { ok: true, data: { id } };
  }

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("stock_thresholds")
    .update(updates)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "此倉庫 + 料件已存在水位設定" };
    }
    return { ok: false, error: `更新水位失敗：${error.message}` };
  }
  revalidatePath("/parts/alerts/thresholds");
  revalidatePath(`/parts/alerts/thresholds/${id}`);
  return { ok: true, data: { id } };
}

export async function setThresholdActiveAction(
  id: string,
  active: boolean,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("stock_thresholds")
    .update({ is_active: active })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `切換啟用狀態失敗：${error.message}` };
  revalidatePath("/parts/alerts/thresholds");
  revalidatePath(`/parts/alerts/thresholds/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteThresholdAction(
  id: string,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("stock_thresholds")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `刪除水位失敗：${error.message}` };
  revalidatePath("/parts/alerts/thresholds");
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────────────────────
// 工單增項閉環（parts_workorder_loop_entries）
//
// 待料工單追蹤：每張 RO 缺料時建立一筆 entry，等補貨入庫後 resolve。
// status: pending（待料）→ escalated（催單／逾期）→ resolved（已解除）
// ──────────────────────────────────────────────────────────────────────────

export type WorkorderLoopRow = Tables["parts_workorder_loop_entries"]["Row"];

export type WorkorderLoopStatus = "pending" | "escalated" | "resolved";

const WORKORDER_LOOP_REVALIDATE = ["/parts/alerts/work-order-loop"];

export type WorkorderLoopFilter = {
  q?: string;
  status?: WorkorderLoopStatus | "";
  overdue_only?: boolean;
};

export async function listWorkorderLoopEntries(
  filter: WorkorderLoopFilter = {},
): Promise<WorkorderLoopRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("parts_workorder_loop_entries")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.overdue_only) q = q.eq("is_overdue", true);
  const { data, error } = await q;
  if (error) throw error;
  let rows = data ?? [];
  if (filter.q) {
    const ql = filter.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.ro_no.toLowerCase().includes(ql) ||
        (r.missing_parts ?? "").toLowerCase().includes(ql) ||
        (r.po_no ?? "").toLowerCase().includes(ql) ||
        (r.sa_name ?? "").toLowerCase().includes(ql),
    );
  }
  return rows;
}

export async function getWorkorderLoopPageData(
  filter: WorkorderLoopFilter = {},
): Promise<{ entries: WorkorderLoopRow[]; canEdit: boolean }> {
  const [entries, canEdit] = await Promise.all([
    listWorkorderLoopEntries(filter),
    hasPermission(PERMISSIONS.ALERT_CONFIG),
  ]);
  return { entries, canEdit };
}

export async function getWorkorderLoopEntryById(
  id: string,
): Promise<{ row: WorkorderLoopRow; canEdit: boolean } | null> {
  if (!id) return null;
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("parts_workorder_loop_entries")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const canEdit = await hasPermission(PERMISSIONS.ALERT_CONFIG);
  return { row: data, canEdit };
}

export type WorkorderLoopInput = {
  ro_no: string;
  missing_parts: string;
  sa_name?: string | null;
  shortage_reason?: string | null;
  po_no?: string | null;
  eta_label?: string | null;
  days_pending?: number;
  status?: WorkorderLoopStatus;
  is_overdue?: boolean;
  sort_order?: number;
};

function validateWorkorderLoopInput(input: WorkorderLoopInput): string | null {
  if (!input.ro_no?.trim()) return "工單號必填";
  if (!input.missing_parts?.trim()) return "缺料備件必填";
  if (input.status && !["pending", "escalated", "resolved"].includes(input.status)) {
    return "狀態不合法";
  }
  if (input.days_pending != null && (Number.isNaN(input.days_pending) || input.days_pending < 0)) {
    return "待料天數必須是非負整數";
  }
  return null;
}

export async function createWorkorderLoopEntryAction(
  input: WorkorderLoopInput,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const err = validateWorkorderLoopInput(input);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("parts_workorder_loop_entries")
    .insert({
      brand_id: scope.brand_id,
      ro_no: input.ro_no.trim(),
      missing_parts: input.missing_parts.trim(),
      sa_name: input.sa_name?.trim() || null,
      shortage_reason: input.shortage_reason?.trim() || null,
      po_no: input.po_no?.trim() || null,
      eta_label: input.eta_label?.trim() || null,
      days_pending: input.days_pending ?? 0,
      status: input.status ?? "pending",
      is_overdue: input.is_overdue ?? false,
      sort_order: input.sort_order ?? 99,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `新增待料工單失敗：${error.message}` };
  for (const p of WORKORDER_LOOP_REVALIDATE) revalidatePath(p);
  return { ok: true, data: { id: data.id } };
}

export async function updateWorkorderLoopEntryAction(
  id: string,
  patch: Partial<WorkorderLoopInput>,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();

  // 載現況
  const cur = await supabase
    .from("parts_workorder_loop_entries")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (cur.error) return { ok: false, error: `讀取現況失敗：${cur.error.message}` };
  if (!cur.data) return { ok: false, error: "待料工單不存在" };

  const merged: WorkorderLoopInput = {
    ro_no: patch.ro_no?.trim() ?? cur.data.ro_no,
    missing_parts: patch.missing_parts?.trim() ?? cur.data.missing_parts,
    sa_name: patch.sa_name !== undefined ? patch.sa_name?.trim() || null : cur.data.sa_name,
    shortage_reason:
      patch.shortage_reason !== undefined
        ? patch.shortage_reason?.trim() || null
        : cur.data.shortage_reason,
    po_no: patch.po_no !== undefined ? patch.po_no?.trim() || null : cur.data.po_no,
    eta_label: patch.eta_label !== undefined ? patch.eta_label?.trim() || null : cur.data.eta_label,
    days_pending: patch.days_pending ?? cur.data.days_pending,
    status: (patch.status ?? cur.data.status) as WorkorderLoopStatus,
    is_overdue: patch.is_overdue ?? cur.data.is_overdue,
    sort_order: patch.sort_order ?? cur.data.sort_order,
  };
  const err = validateWorkorderLoopInput(merged);
  if (err) return { ok: false, error: err };

  const { error } = await supabase
    .from("parts_workorder_loop_entries")
    .update({
      ro_no: merged.ro_no,
      missing_parts: merged.missing_parts,
      sa_name: merged.sa_name,
      shortage_reason: merged.shortage_reason,
      po_no: merged.po_no,
      eta_label: merged.eta_label,
      days_pending: merged.days_pending,
      status: merged.status,
      is_overdue: merged.is_overdue,
      sort_order: merged.sort_order,
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: `更新待料工單失敗：${error.message}` };
  for (const p of WORKORDER_LOOP_REVALIDATE) revalidatePath(p);
  revalidatePath(`/parts/alerts/work-order-loop/${id}`);
  return { ok: true, data: { id } };
}

export async function resolveWorkorderLoopEntryAction(
  id: string,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("parts_workorder_loop_entries")
    .update({ status: "resolved", is_overdue: false })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: `解除失敗：${error.message}` };
  for (const p of WORKORDER_LOOP_REVALIDATE) revalidatePath(p);
  revalidatePath(`/parts/alerts/work-order-loop/${id}`);
  return { ok: true, data: { id } };
}

export async function escalateWorkorderLoopEntryAction(
  id: string,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("parts_workorder_loop_entries")
    .update({ status: "escalated", is_overdue: true })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: `催單失敗：${error.message}` };
  for (const p of WORKORDER_LOOP_REVALIDATE) revalidatePath(p);
  revalidatePath(`/parts/alerts/work-order-loop/${id}`);
  return { ok: true, data: { id } };
}

export async function setWorkorderLoopEntryStatusAction(
  id: string,
  status: WorkorderLoopStatus,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  if (!["pending", "escalated", "resolved"].includes(status)) {
    return { ok: false, error: "狀態不合法" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();
  const isOverdue = status === "escalated";
  const { error } = await supabase
    .from("parts_workorder_loop_entries")
    .update({ status, is_overdue: isOverdue ? true : status === "resolved" ? false : undefined as never })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: `切換狀態失敗：${error.message}` };
  for (const p of WORKORDER_LOOP_REVALIDATE) revalidatePath(p);
  revalidatePath(`/parts/alerts/work-order-loop/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteWorkorderLoopEntryAction(
  id: string,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("parts_workorder_loop_entries")
    .delete()
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  for (const p of WORKORDER_LOOP_REVALIDATE) revalidatePath(p);
  return { ok: true, data: { id } };
}

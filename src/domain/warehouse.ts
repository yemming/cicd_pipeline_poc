"use server";

/**
 * Domain Helper — Warehouse（倉儲設定）
 *
 * 撈 warehouses 表 + count zones/bins/slots（給倉儲四層架構頁的總覽用）
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { listRulesByKind } from "@/domain/rules";
import { hasPermission, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";
import type { BusinessRuleRow } from "@/domain/rules";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function mapDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23505") return "代碼已存在（同一倉庫不可重複）";
  if (error.code === "23503") return "FK 約束失敗（參照的資料不存在）";
  if (error.code === "23514") return `欄位驗證失敗：${error.message}`;
  if (error.code === "P0001") return error.message;
  return `${fallback}：${error.message}`;
}

function revalidateBins() {
  revalidatePath("/parts/setup/warehouse-bins");
}

type Tables = Database["public"]["Tables"];
export type WarehouseRow = Tables["warehouses"]["Row"];
export type ZoneRow = Tables["warehouse_zones"]["Row"];
export type BinRow = Tables["warehouse_bins"]["Row"];
export type ZoneWithBins = ZoneRow & { bins: BinRow[] };

export type WarehouseSummary = {
  id: string;
  code: string;
  name: string;
  type: string | null;
  zone_count: number;
  bin_count: number;
  slot_count: number;
  utilization_pct: number | null;
};

export async function listWarehousesWithCounts(): Promise<WarehouseSummary[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data: warehouses, error } = await supabase
    .from("warehouses")
    .select("id, code, name, type, metadata, is_active")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  if (!warehouses || warehouses.length === 0) return [];

  const ids = warehouses.map((w) => w.id);

  // 各表 count（client side group by）
  const [zonesRes, binsRes, slotsRes] = await Promise.all([
    supabase.from("warehouse_zones").select("warehouse_id").in("warehouse_id", ids),
    supabase.from("warehouse_bins").select("warehouse_id").in("warehouse_id", ids),
    supabase.from("warehouse_slots").select("warehouse_id").in("warehouse_id", ids),
  ]);
  if (zonesRes.error) throw zonesRes.error;
  if (binsRes.error) throw binsRes.error;
  if (slotsRes.error) throw slotsRes.error;

  function tally(rows: { warehouse_id: string | null }[] | null) {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      if (!r.warehouse_id) continue;
      m.set(r.warehouse_id, (m.get(r.warehouse_id) ?? 0) + 1);
    }
    return m;
  }
  const zoneByWh = tally(zonesRes.data);
  const binByWh = tally(binsRes.data);
  const slotByWh = tally(slotsRes.data);

  return warehouses.map((w) => {
    const meta = (w.metadata ?? {}) as Record<string, unknown>;
    const utilization = typeof meta.utilization_pct === "number" ? meta.utilization_pct : null;
    return {
      id: w.id,
      code: w.code ?? "",
      name: w.name ?? "",
      type: w.type ?? null,
      zone_count: zoneByWh.get(w.id) ?? 0,
      bin_count: binByWh.get(w.id) ?? 0,
      slot_count: slotByWh.get(w.id) ?? 0,
      utilization_pct: utilization,
    };
  });
}

export async function getWarehouseArchPageData(): Promise<{
  layers: BusinessRuleRow[];
  warehouses: WarehouseSummary[];
  canEdit: boolean;
}> {
  const [layers, warehouses, canEdit] = await Promise.all([
    listRulesByKind("warehouse_layer"),
    listWarehousesWithCounts(),
    hasPermission(PERMISSIONS.PARTS_WAREHOUSE_ARCH_EDIT),
  ]);
  return { layers, warehouses, canEdit };
}

/** 給 org page 用：撈當前 brand 所有 active warehouse_bins 並 group by warehouse_id 計數 */
export async function getBinCountsByWarehouseId(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("warehouse_bins")
    .select("warehouse_id")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (!row.warehouse_id) continue;
    counts[row.warehouse_id] = (counts[row.warehouse_id] ?? 0) + 1;
  }
  return counts;
}

// ──────────────────────────────────────────────────────────────────────────
// 倉庫 / 庫區 / 庫位 設定頁
// ──────────────────────────────────────────────────────────────────────────

export async function getWarehouseBinsPageData(warehouseId?: string): Promise<{
  warehouses: WarehouseSummary[];
  activeWarehouse: WarehouseSummary | null;
  zones: ZoneWithBins[];
}> {
  const warehouses = await listWarehousesWithCounts();
  if (warehouses.length === 0) {
    return { warehouses, activeWarehouse: null, zones: [] };
  }

  const activeWarehouse =
    warehouses.find((w) => w.id === warehouseId) ?? warehouses[0];

  const supabase = await createClient();
  const [zonesRes, binsRes] = await Promise.all([
    supabase
      .from("warehouse_zones")
      .select("*")
      .eq("warehouse_id", activeWarehouse.id)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("warehouse_bins")
      .select("*")
      .eq("warehouse_id", activeWarehouse.id)
      .eq("is_active", true)
      .order("code"),
  ]);
  if (zonesRes.error) throw zonesRes.error;
  if (binsRes.error) throw binsRes.error;

  const binsByZone = new Map<string, BinRow[]>();
  for (const bin of (binsRes.data ?? []) as BinRow[]) {
    if (!bin.zone_id) continue;
    const arr = binsByZone.get(bin.zone_id) ?? [];
    arr.push(bin);
    binsByZone.set(bin.zone_id, arr);
  }

  const zones: ZoneWithBins[] = ((zonesRes.data ?? []) as ZoneRow[]).map((z) => ({
    ...z,
    bins: binsByZone.get(z.id) ?? [],
  }));

  return { warehouses, activeWarehouse, zones };
}

// ──────────────────────────────────────────────────────────────────────────
// CRUD — Phase 2（2026-05-11）
// ──────────────────────────────────────────────────────────────────────────

const ZONE_CONTROL_LEVELS = ["normal", "high_value", "hazardous"] as const;
const BIN_STATUSES = ["used", "empty", "reserved"] as const;
type BinStatus = (typeof BIN_STATUSES)[number];

export async function createZone(input: {
  warehouseId: string;
  code: string;
  name: string;
  controlLevel?: (typeof ZONE_CONTROL_LEVELS)[number];
  notes?: string;
}): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_WAREHOUSE_ARCH_EDIT);
  const scope = await getActiveScope();
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code) return { ok: false, error: "庫區代碼必填" };
  if (!name) return { ok: false, error: "庫區名稱必填" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouse_zones")
    .insert({
      brand_id: scope.brand_id,
      warehouse_id: input.warehouseId,
      code,
      name,
      control_level: input.controlLevel ?? "normal",
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error, "建立庫區失敗") };
  revalidateBins();
  return { ok: true, data: { id: data.id } };
}

export async function updateZone(
  id: string,
  patch: Partial<{ code: string; name: string; controlLevel: string; notes: string; is_active: boolean }>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_WAREHOUSE_ARCH_EDIT);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.code !== undefined) {
    const v = patch.code.trim();
    if (!v) return { ok: false, error: "庫區代碼必填" };
    update.code = v;
  }
  if (patch.name !== undefined) {
    const v = patch.name.trim();
    if (!v) return { ok: false, error: "庫區名稱必填" };
    update.name = v;
  }
  if (patch.controlLevel !== undefined) {
    if (!ZONE_CONTROL_LEVELS.includes(patch.controlLevel as (typeof ZONE_CONTROL_LEVELS)[number])) {
      return { ok: false, error: "管控等級不合法" };
    }
    update.control_level = patch.controlLevel;
  }
  if (patch.notes !== undefined) update.notes = patch.notes.trim() || null;
  if (patch.is_active !== undefined) update.is_active = patch.is_active;

  const supabase = await createClient();
  const { error } = await supabase.from("warehouse_zones").update(update).eq("id", id);
  if (error) return { ok: false, error: mapDbError(error, "更新庫區失敗") };
  revalidateBins();
  return { ok: true, data: { id } };
}

export async function deleteZone(id: string): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_WAREHOUSE_ARCH_EDIT);
  const supabase = await createClient();
  const { error } = await supabase.rpc("warehouse_soft_delete_zone", { p_zone_id: id });
  if (error) return { ok: false, error: mapDbError(error, "刪除庫區失敗") };
  revalidateBins();
  return { ok: true, data: { id } };
}

export async function createBin(input: {
  warehouseId: string;
  zoneId: string;
  code: string;
  name?: string;
  capacity?: number;
  status?: BinStatus;
}): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_WAREHOUSE_ARCH_EDIT);
  const scope = await getActiveScope();
  const code = input.code.trim();
  if (!code) return { ok: false, error: "庫位代碼必填" };

  const status = input.status ?? "empty";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouse_bins")
    .insert({
      brand_id: scope.brand_id,
      warehouse_id: input.warehouseId,
      zone_id: input.zoneId,
      code,
      name: input.name?.trim() || null,
      capacity: input.capacity ?? null,
      metadata: { status },
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error, "建立庫位失敗") };
  revalidateBins();
  return { ok: true, data: { id: data.id } };
}

export async function createBinsBatch(input: {
  warehouseId: string;
  zoneId: string;
  prefix: string;
  fromN: number;
  toN: number;
  padding?: number;
  capacity?: number;
  status?: BinStatus;
}): Promise<ActionResult<{ created: number }>> {
  await requirePermission(PERMISSIONS.PARTS_WAREHOUSE_ARCH_EDIT);
  const scope = await getActiveScope();

  if (!Number.isInteger(input.fromN) || !Number.isInteger(input.toN)) {
    return { ok: false, error: "起號 / 訖號必須是整數" };
  }
  if (input.toN < input.fromN) return { ok: false, error: "訖號不可小於起號" };
  if (input.toN - input.fromN > 199) return { ok: false, error: "一次最多建 200 個庫位" };

  const padding = input.padding ?? 2;
  const status = input.status ?? "empty";
  const rows = [];
  for (let n = input.fromN; n <= input.toN; n++) {
    rows.push({
      brand_id: scope.brand_id,
      warehouse_id: input.warehouseId,
      zone_id: input.zoneId,
      code: `${input.prefix}${String(n).padStart(padding, "0")}`,
      capacity: input.capacity ?? null,
      metadata: { status },
    });
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("warehouse_bins")
    .insert(rows, { count: "exact" });
  if (error) return { ok: false, error: mapDbError(error, "批次建庫位失敗") };
  revalidateBins();
  return { ok: true, data: { created: count ?? rows.length } };
}

export async function updateBin(
  id: string,
  patch: Partial<{ code: string; name: string; capacity: number | null; status: BinStatus }>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_WAREHOUSE_ARCH_EDIT);
  const supabase = await createClient();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.code !== undefined) {
    const v = patch.code.trim();
    if (!v) return { ok: false, error: "庫位代碼必填" };
    update.code = v;
  }
  if (patch.name !== undefined) update.name = patch.name.trim() || null;
  if (patch.capacity !== undefined) update.capacity = patch.capacity;

  if (patch.status !== undefined) {
    if (!BIN_STATUSES.includes(patch.status)) {
      return { ok: false, error: "庫位狀態不合法" };
    }
    // 把 metadata.status patch 進 jsonb（保留其他 key）
    const { data: cur, error: e0 } = await supabase
      .from("warehouse_bins")
      .select("metadata")
      .eq("id", id)
      .single();
    if (e0) return { ok: false, error: mapDbError(e0, "讀取庫位失敗") };
    const curMeta = (cur?.metadata ?? {}) as Record<string, unknown>;
    update.metadata = { ...curMeta, status: patch.status };
  }

  const { error } = await supabase.from("warehouse_bins").update(update).eq("id", id);
  if (error) return { ok: false, error: mapDbError(error, "更新庫位失敗") };
  revalidateBins();
  return { ok: true, data: { id } };
}

export async function deleteBin(id: string): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_WAREHOUSE_ARCH_EDIT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("warehouse_bins")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: mapDbError(error, "刪除庫位失敗") };
  revalidateBins();
  return { ok: true, data: { id } };
}

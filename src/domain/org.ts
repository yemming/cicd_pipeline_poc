"use server";

/**
 * Domain Helper — Org（組織三層 + 法人）
 *
 * 三個 entity 共用這個 module：
 *   - Region   = organizations where type='region', level=1
 *   - Store    = organizations where type='store',  level=2
 *   - Warehouse= warehouses（FK org_id → organizations.id）
 *
 * 架構：POC 階段資料存取慣例（CLAUDE.md / .claude/skills/spec-to-feature/references/architecture.md）
 *   - UI 一律 import 此檔，不准直接 import @/lib/supabase/*
 *   - 此檔內部走 server-side supabase client + getActiveScope
 *   - 變動中欄位丟 metadata jsonb；穩定欄位走 typed column
 *   - 既有 src/lib/master-data/org-actions.ts 不刪、未來副作用階段 reuse
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type OrgRow = Tables["organizations"]["Row"];
export type WarehouseRow = Tables["warehouses"]["Row"];
export type SubsidiaryRow = Tables["subsidiaries"]["Row"];

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// 影響的路徑（任何寫入都 revalidate 這些）
const REVALIDATE_PATHS = ["/parts/setup/org"];
function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

const STORE_TYPES = ["direct", "dealer"] as const;
export type StoreType = (typeof STORE_TYPES)[number];

const WAREHOUSE_TYPES = [
  "main",
  "temporary",
  "consignment",
  "warranty",
  "transit",
  "quarantine",
  "virtual",
] as const;
export type WarehouseType = (typeof WAREHOUSE_TYPES)[number];

// ──────────────────────────────────────────────────────────────────────────
// 共用工具
// ──────────────────────────────────────────────────────────────────────────

function trim(v: string | null | undefined): string {
  return (v ?? "").trim();
}
function nullable(v: string | null | undefined): string | null {
  const s = trim(v);
  return s.length === 0 ? null : s;
}

/** 抽出 typed core 欄位以外的 key → metadata jsonb */
function splitMetadata<T extends Record<string, unknown>>(
  input: T,
  typedKeys: readonly (keyof T)[],
): { typed: Partial<T>; metadata: Record<string, unknown> } {
  const typed: Partial<T> = {};
  const metadata: Record<string, unknown> = {};
  const known = new Set(typedKeys as readonly string[]);
  for (const [k, v] of Object.entries(input)) {
    if (known.has(k)) (typed as Record<string, unknown>)[k] = v;
    else metadata[k] = v;
  }
  return { typed, metadata };
}

/**
 * 解析 brand 預設法人。
 *
 * - 傳 brandId（新 code 路徑）：讀 brands.default_subsidiary_id（B1 已 backfill 雙 brand）
 * - 沒傳 brandId（legacy fallback）：取第一個 non-root active subsidiary
 *   ← 這條保留是避免 break 既有呼叫者，新 code 一律帶 brandId
 */
async function resolveDefaultSubsidiaryId(
  brandId?: string,
): Promise<string | null> {
  const supabase = await createClient();
  if (brandId) {
    const { data } = await supabase
      .from("brands")
      .select("default_subsidiary_id")
      .eq("id", brandId)
      .single();
    return (
      (data as { default_subsidiary_id: string | null } | null)
        ?.default_subsidiary_id ?? null
    );
  }
  // legacy fallback - 新 code 不該走這條
  const { data, error } = await supabase
    .from("subsidiaries")
    .select("id")
    .eq("is_active", true)
    .eq("is_root", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.id;
}

function mapDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23505") return "代碼已存在";
  if (error.code === "23503") return "FK 約束失敗（參照的資料不存在或已被刪除）";
  return `${fallback}：${error.message}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Region（type='region', level=1）
// ──────────────────────────────────────────────────────────────────────────

export type RegionListFilter = {
  q?: string;
  is_active?: boolean | null;
};
export type AddRegionInput = {
  code: string;
  name: string;
  notes?: string | null;
  is_active?: boolean;
  /** 任意額外欄位 → 落到 metadata jsonb */
  [key: string]: unknown;
};
export type UpdateRegionPatch = Partial<AddRegionInput>;

const REGION_TYPED_KEYS = [
  "code",
  "name",
  "notes",
  "is_active",
] as const;

export async function listRegions(
  filter?: RegionListFilter,
): Promise<{ data: OrgRow[]; error: string | null }> {
  const supabase = await createClient();
  const { brand_id } = await getActiveScope();
  let query = supabase
    .from("organizations")
    .select("*")
    .eq("brand_id", brand_id)
    .eq("type", "region")
    .order("code", { ascending: true });
  const q = trim(filter?.q);
  if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
  if (filter?.is_active === true || filter?.is_active === false) {
    query = query.eq("is_active", filter.is_active);
  }
  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

export async function getRegionById(
  id: string,
): Promise<{ data: OrgRow | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .eq("type", "region")
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function addRegion(
  input: AddRegionInput,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.ORG_EDIT);
  if (!trim(input.code)) return { ok: false, error: "區域代碼必填" };
  if (!trim(input.name)) return { ok: false, error: "區域名稱必填" };

  const { brand_id } = await getActiveScope();
  const subsidiary_id = await resolveDefaultSubsidiaryId(brand_id);
  if (!subsidiary_id) return { ok: false, error: "找不到可用的法人，請先建立法人" };

  const { typed, metadata } = splitMetadata(input, REGION_TYPED_KEYS);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organizations")
    .insert({
      brand_id,
      group_id: "default",
      subsidiary_id,
      type: "region",
      level: 1,
      parent_id: null,
      code: trim(typed.code as string),
      name: trim(typed.name as string),
      notes: nullable(typed.notes as string | null | undefined),
      is_active: (typed.is_active as boolean | undefined) ?? true,
      metadata,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error, "建立區域失敗") };
  revalidateAll();
  return { ok: true, data: { id: data.id } };
}

export async function updateRegion(
  id: string,
  patch: UpdateRegionPatch,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.ORG_EDIT);
  if (!id) return { ok: false, error: "缺少區域 id" };

  const { typed, metadata } = splitMetadata(patch, REGION_TYPED_KEYS);
  const supabase = await createClient();

  const updateRow: Record<string, unknown> = {};
  if (typed.code !== undefined) updateRow.code = trim(typed.code as string);
  if (typed.name !== undefined) updateRow.name = trim(typed.name as string);
  if (typed.notes !== undefined) updateRow.notes = nullable(typed.notes as string | null | undefined);
  if (typed.is_active !== undefined) updateRow.is_active = typed.is_active;

  // metadata: 採取 merge 策略（既有 metadata + patch 的 metadata key）
  if (Object.keys(metadata).length > 0) {
    const { data: current } = await supabase
      .from("organizations")
      .select("metadata")
      .eq("id", id)
      .maybeSingle();
    const currentMeta =
      (current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? (current.metadata as Record<string, unknown>)
        : {}) ?? {};
    updateRow.metadata = { ...currentMeta, ...metadata };
  }

  const { error } = await supabase
    .from("organizations")
    .update(updateRow)
    .eq("id", id)
    .eq("type", "region");
  if (error) return { ok: false, error: mapDbError(error, "更新區域失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

export async function setRegionActive(id: string, ok: boolean): Promise<Result<{ id: string }>> {
  return updateRegion(id, { is_active: ok });
}

export async function deleteRegion(id: string): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.ORG_EDIT);
  if (!id) return { ok: false, error: "缺少區域 id" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("org_soft_delete_region", { p_region_id: id });
  if (error) return { ok: false, error: mapDbError(error, "刪除區域失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────────────────────
// Store（type='store', level=2）
// ──────────────────────────────────────────────────────────────────────────

export type StoreListFilter = {
  region_id?: string;
  q?: string;
  is_active?: boolean | null;
};

export type AddStoreInput = {
  code: string;
  name: string;
  region_id: string;
  subsidiary_id: string;
  store_type?: StoreType;
  short_name?: string | null;
  address?: string | null;
  phone?: string | null;
  responsible_person?: string | null;
  bank_account?: string | null;
  is_active?: boolean;
  [key: string]: unknown;
};
export type UpdateStorePatch = Partial<AddStoreInput>;

const STORE_TYPED_KEYS = [
  "code",
  "name",
  "region_id",
  "subsidiary_id",
  "store_type",
  "short_name",
  "address",
  "phone",
  "responsible_person",
  "bank_account",
  "is_active",
] as const;

function pickStoreType(v: unknown): StoreType {
  return (STORE_TYPES as readonly string[]).includes(typeof v === "string" ? v : "")
    ? (v as StoreType)
    : "direct";
}

export async function listStores(
  filter?: StoreListFilter,
): Promise<{ data: OrgRow[]; error: string | null }> {
  const supabase = await createClient();
  const { brand_id } = await getActiveScope();
  let query = supabase
    .from("organizations")
    .select("*")
    .eq("brand_id", brand_id)
    .eq("type", "store")
    .order("code", { ascending: true });
  if (filter?.region_id) query = query.eq("parent_id", filter.region_id);
  const q = trim(filter?.q);
  if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
  if (filter?.is_active === true || filter?.is_active === false) {
    query = query.eq("is_active", filter.is_active);
  }
  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

export async function getStoreById(
  id: string,
): Promise<{ data: OrgRow | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .eq("type", "store")
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function addStore(input: AddStoreInput): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.ORG_EDIT);
  if (!trim(input.code)) return { ok: false, error: "門店代碼必填" };
  if (!trim(input.name)) return { ok: false, error: "門店名稱必填" };
  if (!trim(input.region_id)) return { ok: false, error: "請選擇所屬區域" };
  if (!trim(input.subsidiary_id)) return { ok: false, error: "請選擇所屬法人" };

  const { typed, metadata } = splitMetadata(input, STORE_TYPED_KEYS);
  const supabase = await createClient();
  const { brand_id } = await getActiveScope();

  const { data, error } = await supabase
    .from("organizations")
    .insert({
      brand_id,
      group_id: "default",
      subsidiary_id: trim(typed.subsidiary_id as string),
      type: "store",
      level: 2,
      parent_id: trim(typed.region_id as string),
      code: trim(typed.code as string),
      name: trim(typed.name as string),
      short_name: nullable(typed.short_name as string | null | undefined),
      address: nullable(typed.address as string | null | undefined),
      phone: nullable(typed.phone as string | null | undefined),
      responsible_person: nullable(typed.responsible_person as string | null | undefined),
      bank_account: nullable(typed.bank_account as string | null | undefined),
      store_type: pickStoreType(typed.store_type),
      is_active: (typed.is_active as boolean | undefined) ?? true,
      metadata,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error, "建立門店失敗") };
  revalidateAll();
  return { ok: true, data: { id: data.id } };
}

export async function updateStore(
  id: string,
  patch: UpdateStorePatch,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.ORG_EDIT);
  if (!id) return { ok: false, error: "缺少門店 id" };

  const { typed, metadata } = splitMetadata(patch, STORE_TYPED_KEYS);
  const supabase = await createClient();
  const updateRow: Record<string, unknown> = {};
  if (typed.code !== undefined) updateRow.code = trim(typed.code as string);
  if (typed.name !== undefined) updateRow.name = trim(typed.name as string);
  if (typed.region_id !== undefined) updateRow.parent_id = trim(typed.region_id as string);
  if (typed.subsidiary_id !== undefined) updateRow.subsidiary_id = trim(typed.subsidiary_id as string);
  if (typed.short_name !== undefined) updateRow.short_name = nullable(typed.short_name as string | null | undefined);
  if (typed.address !== undefined) updateRow.address = nullable(typed.address as string | null | undefined);
  if (typed.phone !== undefined) updateRow.phone = nullable(typed.phone as string | null | undefined);
  if (typed.responsible_person !== undefined)
    updateRow.responsible_person = nullable(typed.responsible_person as string | null | undefined);
  if (typed.bank_account !== undefined)
    updateRow.bank_account = nullable(typed.bank_account as string | null | undefined);
  if (typed.store_type !== undefined) updateRow.store_type = pickStoreType(typed.store_type);
  if (typed.is_active !== undefined) updateRow.is_active = typed.is_active;

  if (Object.keys(metadata).length > 0) {
    const { data: current } = await supabase
      .from("organizations")
      .select("metadata")
      .eq("id", id)
      .maybeSingle();
    const currentMeta =
      (current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? (current.metadata as Record<string, unknown>)
        : {}) ?? {};
    updateRow.metadata = { ...currentMeta, ...metadata };
  }

  const { error } = await supabase
    .from("organizations")
    .update(updateRow)
    .eq("id", id)
    .eq("type", "store");
  if (error) return { ok: false, error: mapDbError(error, "更新門店失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

export async function setStoreActive(id: string, ok: boolean): Promise<Result<{ id: string }>> {
  return updateStore(id, { is_active: ok } as UpdateStorePatch);
}

export async function deleteStore(id: string): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.ORG_EDIT);
  if (!id) return { ok: false, error: "缺少門店 id" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("org_soft_delete_store", { p_store_id: id });
  if (error) return { ok: false, error: mapDbError(error, "刪除門店失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────────────────────
// Warehouse
// ──────────────────────────────────────────────────────────────────────────

export type WarehouseListFilter = {
  org_id?: string;
  type?: WarehouseType;
  q?: string;
  is_active?: boolean | null;
};

export type AddWarehouseInput = {
  code: string;
  name: string;
  org_id: string;
  type?: WarehouseType;
  address?: string | null;
  notes?: string | null;
  is_active?: boolean;
  [key: string]: unknown;
};
export type UpdateWarehousePatch = Partial<AddWarehouseInput>;

const WAREHOUSE_TYPED_KEYS = [
  "code",
  "name",
  "org_id",
  "type",
  "address",
  "notes",
  "is_active",
] as const;

function pickWarehouseType(v: unknown): WarehouseType {
  return (WAREHOUSE_TYPES as readonly string[]).includes(typeof v === "string" ? v : "")
    ? (v as WarehouseType)
    : "main";
}

export async function listWarehouses(
  filter?: WarehouseListFilter,
): Promise<{ data: WarehouseRow[]; error: string | null }> {
  const supabase = await createClient();
  const { brand_id } = await getActiveScope();
  let query = supabase
    .from("warehouses")
    .select("*")
    .eq("brand_id", brand_id)
    .order("code", { ascending: true });
  if (filter?.org_id) query = query.eq("org_id", filter.org_id);
  if (filter?.type) query = query.eq("type", filter.type);
  const q = trim(filter?.q);
  if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
  if (filter?.is_active === true || filter?.is_active === false) {
    query = query.eq("is_active", filter.is_active);
  }
  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

export async function getWarehouseById(
  id: string,
): Promise<{ data: WarehouseRow | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function addWarehouse(input: AddWarehouseInput): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.WAREHOUSE_EDIT);
  if (!trim(input.code)) return { ok: false, error: "倉庫代碼必填" };
  if (!trim(input.name)) return { ok: false, error: "倉庫名稱必填" };
  if (!trim(input.org_id)) return { ok: false, error: "請選擇所屬門店" };

  const { typed, metadata } = splitMetadata(input, WAREHOUSE_TYPED_KEYS);
  const supabase = await createClient();
  const { brand_id } = await getActiveScope();

  const { data, error } = await supabase
    .from("warehouses")
    .insert({
      brand_id,
      org_id: trim(typed.org_id as string),
      code: trim(typed.code as string),
      name: trim(typed.name as string),
      type: pickWarehouseType(typed.type),
      address: nullable(typed.address as string | null | undefined),
      notes: nullable(typed.notes as string | null | undefined),
      is_active: (typed.is_active as boolean | undefined) ?? true,
      metadata,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error, "建立倉庫失敗") };
  revalidateAll();
  return { ok: true, data: { id: data.id } };
}

export async function updateWarehouse(
  id: string,
  patch: UpdateWarehousePatch,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.WAREHOUSE_EDIT);
  if (!id) return { ok: false, error: "缺少倉庫 id" };

  const { typed, metadata } = splitMetadata(patch, WAREHOUSE_TYPED_KEYS);
  const supabase = await createClient();
  const updateRow: Record<string, unknown> = {};
  if (typed.code !== undefined) updateRow.code = trim(typed.code as string);
  if (typed.name !== undefined) updateRow.name = trim(typed.name as string);
  if (typed.org_id !== undefined) updateRow.org_id = trim(typed.org_id as string);
  if (typed.type !== undefined) updateRow.type = pickWarehouseType(typed.type);
  if (typed.address !== undefined) updateRow.address = nullable(typed.address as string | null | undefined);
  if (typed.notes !== undefined) updateRow.notes = nullable(typed.notes as string | null | undefined);
  if (typed.is_active !== undefined) updateRow.is_active = typed.is_active;

  if (Object.keys(metadata).length > 0) {
    const { data: current } = await supabase.from("warehouses").select("metadata").eq("id", id).maybeSingle();
    const currentMeta =
      (current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? (current.metadata as Record<string, unknown>)
        : {}) ?? {};
    updateRow.metadata = { ...currentMeta, ...metadata };
  }

  const { error } = await supabase.from("warehouses").update(updateRow).eq("id", id);
  if (error) return { ok: false, error: mapDbError(error, "更新倉庫失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

export async function setWarehouseActive(id: string, ok: boolean): Promise<Result<{ id: string }>> {
  return updateWarehouse(id, { is_active: ok } as UpdateWarehousePatch);
}

export async function deleteWarehouse(id: string): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.WAREHOUSE_EDIT);
  if (!id) return { ok: false, error: "缺少倉庫 id" };

  const supabase = await createClient();
  const { error } = await supabase.from("warehouses").delete().eq("id", id);
  if (error) return { ok: false, error: mapDbError(error, "刪除倉庫失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────────────────────
// Lookup（給 form dropdown 用）
// ──────────────────────────────────────────────────────────────────────────

export type SubsidiaryOption = {
  id: string;
  legal_name: string;
  short_name: string | null;
  tax_id: string;
};
export type RegionOption = { id: string; code: string; name: string };
export type StoreOption = { id: string; code: string; name: string; region_id: string | null };

export async function listSubsidiaryOptions(): Promise<{ data: SubsidiaryOption[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subsidiaries")
    .select("id, legal_name, short_name, tax_id, is_root, is_active")
    .eq("is_active", true)
    .eq("is_root", false)
    .order("legal_name", { ascending: true });
  if (error) return { data: [], error: error.message };
  const rows = (data ?? []).map((s) => ({
    id: s.id,
    legal_name: s.legal_name,
    short_name: s.short_name,
    tax_id: s.tax_id,
  }));
  return { data: rows, error: null };
}

export async function listRegionOptions(): Promise<{ data: RegionOption[]; error: string | null }> {
  const supabase = await createClient();
  const { brand_id } = await getActiveScope();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, code, name")
    .eq("brand_id", brand_id)
    .eq("type", "region")
    .eq("is_active", true)
    .order("code", { ascending: true });
  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

// ──────────────────────────────────────────────────────────────────────────
// Hierarchy Tree（給 <HierarchyTree> 用）
// ──────────────────────────────────────────────────────────────────────────

export type OrgTreeNode = {
  /** 節點 id：region/store 用 organizations.id；warehouse 用 warehouses.id */
  id: string;
  /** 'region' | 'store' | 'warehouse' — UI 區分 detail panel 樣式用 */
  kind: "region" | "store" | "warehouse";
  /** entity id（同 id，方便 union 寫法） */
  refId: string;
  label: string;
  code: string;
  isActive: boolean;
  /** 該節點下統計：region.storeCount / store.warehouseCount / warehouse.binCount */
  childCount?: number;
  children?: OrgTreeNode[];
};

export type OrgTreeStats = {
  regionCount: number;
  storeCount: number;
  storeActiveCount: number;
  warehouseCount: number;
  warehouseActiveCount: number;
};

/**
 * 撈當前 brand scope 的完整三層樹（含 binCount 統計）。
 *
 * 同 React Server Component 直接呼叫即可。失敗回 `{ data: [], stats, error }`。
 */
export async function getOrgTree(): Promise<{
  data: OrgTreeNode[];
  stats: OrgTreeStats;
  error: string | null;
}> {
  const supabase = await createClient();
  const { brand_id } = await getActiveScope();

  const [regionsRes, storesRes, warehousesRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, code, name, is_active")
      .eq("brand_id", brand_id)
      .eq("type", "region")
      .order("code", { ascending: true }),
    supabase
      .from("organizations")
      .select("id, code, name, is_active, parent_id")
      .eq("brand_id", brand_id)
      .eq("type", "store")
      .order("code", { ascending: true }),
    supabase
      .from("warehouses")
      .select("id, code, name, is_active, org_id")
      .eq("brand_id", brand_id)
      .order("code", { ascending: true }),
  ]);

  const err =
    regionsRes.error?.message ??
    storesRes.error?.message ??
    warehousesRes.error?.message ??
    null;
  if (err) {
    return {
      data: [],
      stats: {
        regionCount: 0,
        storeCount: 0,
        storeActiveCount: 0,
        warehouseCount: 0,
        warehouseActiveCount: 0,
      },
      error: err,
    };
  }

  const regions = regionsRes.data ?? [];
  const stores = storesRes.data ?? [];
  const warehouses = warehousesRes.data ?? [];

  // 撈 bins count（warehouse → bins）
  const warehouseIds = warehouses.map((w) => w.id);
  let binCountsByWarehouseId: Record<string, number> = {};
  if (warehouseIds.length > 0) {
    const { data: binsRows } = await supabase
      .from("warehouse_bins")
      .select("warehouse_id")
      .in("warehouse_id", warehouseIds);
    binCountsByWarehouseId = (binsRows ?? []).reduce<Record<string, number>>(
      (acc, b) => {
        const k = (b as { warehouse_id: string }).warehouse_id;
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      },
      {},
    );
  }

  // 組樹：region → store → warehouse
  const data: OrgTreeNode[] = regions.map((r) => {
    const childStores = stores
      .filter((s) => s.parent_id === r.id)
      .map<OrgTreeNode>((s) => {
        const childWarehouses = warehouses
          .filter((w) => w.org_id === s.id)
          .map<OrgTreeNode>((w) => ({
            id: w.id,
            kind: "warehouse",
            refId: w.id,
            label: w.name,
            code: w.code,
            isActive: w.is_active,
            childCount: binCountsByWarehouseId[w.id] ?? 0,
          }));
        return {
          id: s.id,
          kind: "store",
          refId: s.id,
          label: s.name,
          code: s.code,
          isActive: s.is_active,
          childCount: childWarehouses.length,
          children: childWarehouses,
        };
      });
    return {
      id: r.id,
      kind: "region",
      refId: r.id,
      label: r.name,
      code: r.code,
      isActive: r.is_active,
      childCount: childStores.length,
      children: childStores,
    };
  });

  const stats: OrgTreeStats = {
    regionCount: regions.length,
    storeCount: stores.length,
    storeActiveCount: stores.filter((s) => s.is_active).length,
    warehouseCount: warehouses.length,
    warehouseActiveCount: warehouses.filter((w) => w.is_active).length,
  };

  return { data, stats, error: null };
}

export async function listStoreOptions(): Promise<{ data: StoreOption[]; error: string | null }> {
  const supabase = await createClient();
  const { brand_id } = await getActiveScope();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, code, name, parent_id")
    .eq("brand_id", brand_id)
    .eq("type", "store")
    .eq("is_active", true)
    .order("code", { ascending: true });
  if (error) return { data: [], error: error.message };
  const rows = (data ?? []).map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    region_id: s.parent_id,
  }));
  return { data: rows, error: null };
}

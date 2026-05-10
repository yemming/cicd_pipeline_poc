"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const ORG_PATH = "/parts/setup/org";

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

function trim(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function nullable(v: string | null | undefined): string | null {
  const s = trim(v);
  return s.length === 0 ? null : s;
}

// ──────────────────────────────────────────────────────────
// 銷售區域（level=1, type='region'）
// ──────────────────────────────────────────────────────────

export type RegionInput = {
  name: string;
  code: string;
  /** 涵蓋說明（縣市）放在 notes，前端依此渲染 */
  notes?: string;
  is_active?: boolean;
};

export async function createRegionAction(
  input: RegionInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ORG_EDIT);
  if (!trim(input.name)) return { ok: false, error: "區域名稱必填" };
  if (!trim(input.code)) return { ok: false, error: "區域代碼必填" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
      type: "region",
      level: 1,
      parent_id: null,
      code: trim(input.code),
      name: trim(input.name),
      notes: nullable(input.notes),
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "區域代碼已存在" };
    return { ok: false, error: `建立區域失敗：${error.message}` };
  }
  revalidatePath(ORG_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateRegionAction(
  id: string,
  input: RegionInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ORG_EDIT);
  if (!id) return { ok: false, error: "缺少區域 id" };
  if (!trim(input.name)) return { ok: false, error: "區域名稱必填" };
  if (!trim(input.code)) return { ok: false, error: "區域代碼必填" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      code: trim(input.code),
      name: trim(input.name),
      notes: nullable(input.notes),
      is_active: input.is_active ?? true,
    })
    .eq("id", id)
    .eq("type", "region");
  if (error) {
    if (error.code === "23505") return { ok: false, error: "區域代碼已存在" };
    return { ok: false, error: `更新區域失敗：${error.message}` };
  }
  revalidatePath(ORG_PATH);
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────
// 門店（level=2, type='store'）
// ──────────────────────────────────────────────────────────

export type StoreInput = {
  name: string;
  code: string;
  parent_id: string;
  store_type: StoreType;
  short_name?: string;
  address?: string;
  phone?: string;
  is_active?: boolean;
};

function pickStoreType(v: string | undefined): StoreType {
  return (STORE_TYPES as readonly string[]).includes(v ?? "")
    ? (v as StoreType)
    : "direct";
}

export async function createStoreAction(
  input: StoreInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ORG_EDIT);
  if (!trim(input.name)) return { ok: false, error: "門店名稱必填" };
  if (!trim(input.code)) return { ok: false, error: "門店代碼必填" };
  if (!trim(input.parent_id)) return { ok: false, error: "請選擇所屬區域" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
      type: "store",
      level: 2,
      parent_id: trim(input.parent_id),
      code: trim(input.code),
      name: trim(input.name),
      short_name: nullable(input.short_name),
      address: nullable(input.address),
      phone: nullable(input.phone),
      store_type: pickStoreType(input.store_type),
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "門店代碼已存在" };
    return { ok: false, error: `建立門店失敗：${error.message}` };
  }
  revalidatePath(ORG_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateStoreAction(
  id: string,
  input: StoreInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ORG_EDIT);
  if (!id) return { ok: false, error: "缺少門店 id" };
  if (!trim(input.name)) return { ok: false, error: "門店名稱必填" };
  if (!trim(input.code)) return { ok: false, error: "門店代碼必填" };
  if (!trim(input.parent_id)) return { ok: false, error: "請選擇所屬區域" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      parent_id: trim(input.parent_id),
      code: trim(input.code),
      name: trim(input.name),
      short_name: nullable(input.short_name),
      address: nullable(input.address),
      phone: nullable(input.phone),
      store_type: pickStoreType(input.store_type),
      is_active: input.is_active ?? true,
    })
    .eq("id", id)
    .eq("type", "store");
  if (error) {
    if (error.code === "23505") return { ok: false, error: "門店代碼已存在" };
    return { ok: false, error: `更新門店失敗：${error.message}` };
  }
  revalidatePath(ORG_PATH);
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────
// 倉庫（warehouses table，掛在 store 底下）
// ──────────────────────────────────────────────────────────

export type WarehouseInput = {
  name: string;
  code: string;
  org_id: string;
  type: WarehouseType;
  address?: string;
  notes?: string;
  is_active?: boolean;
};

function pickWarehouseType(v: string | undefined): WarehouseType {
  return (WAREHOUSE_TYPES as readonly string[]).includes(v ?? "")
    ? (v as WarehouseType)
    : "main";
}

export async function createWarehouseAction(
  input: WarehouseInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WAREHOUSE_EDIT);
  if (!trim(input.name)) return { ok: false, error: "倉庫名稱必填" };
  if (!trim(input.code)) return { ok: false, error: "倉庫代碼必填" };
  if (!trim(input.org_id)) return { ok: false, error: "請選擇所屬門店" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
      org_id: trim(input.org_id),
      code: trim(input.code),
      name: trim(input.name),
      type: pickWarehouseType(input.type),
      address: nullable(input.address),
      notes: nullable(input.notes),
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "倉庫代碼已存在" };
    return { ok: false, error: `建立倉庫失敗：${error.message}` };
  }
  revalidatePath(ORG_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateWarehouseAction(
  id: string,
  input: WarehouseInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WAREHOUSE_EDIT);
  if (!id) return { ok: false, error: "缺少倉庫 id" };
  if (!trim(input.name)) return { ok: false, error: "倉庫名稱必填" };
  if (!trim(input.code)) return { ok: false, error: "倉庫代碼必填" };
  if (!trim(input.org_id)) return { ok: false, error: "請選擇所屬門店" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("warehouses")
    .update({
      org_id: trim(input.org_id),
      code: trim(input.code),
      name: trim(input.name),
      type: pickWarehouseType(input.type),
      address: nullable(input.address),
      notes: nullable(input.notes),
      is_active: input.is_active ?? true,
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "倉庫代碼已存在" };
    return { ok: false, error: `更新倉庫失敗：${error.message}` };
  }
  revalidatePath(ORG_PATH);
  return { ok: true, data: { id } };
}

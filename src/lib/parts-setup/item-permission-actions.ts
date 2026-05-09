"use server";

import { revalidatePath } from "next/cache";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/setup/item-permissions";

function trim(v: string | null | undefined): string {
  return (v ?? "").trim();
}
function nullable(v: string | null | undefined): string | null {
  const s = trim(v);
  return s.length === 0 ? null : s;
}

// ──────────────────────────────────────────────────────────
// Roles
// ──────────────────────────────────────────────────────────

export type RoleInput = {
  role_code: string;
  role_name: string;
  sort_order?: number;
  is_active?: boolean;
};

export async function createRoleAction(
  input: RoleInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_ITEM_PERMISSION_EDIT);
  if (!trim(input.role_code)) return { ok: false, error: "角色代碼必填" };
  if (!trim(input.role_name)) return { ok: false, error: "角色名稱必填" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_permission_roles")
    .insert({
      brand_id: getBrandKey(),
      role_code: trim(input.role_code).toLowerCase(),
      role_name: trim(input.role_name),
      sort_order: input.sort_order ?? 99,
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "角色代碼已存在" };
    return { ok: false, error: `建立角色失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateRoleAction(
  id: string,
  input: Partial<RoleInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_ITEM_PERMISSION_EDIT);
  if (!trim(id)) return { ok: false, error: "缺少角色 id" };

  const patch: Record<string, unknown> = {};
  if (input.role_code !== undefined)
    patch.role_code = trim(input.role_code).toLowerCase();
  if (input.role_name !== undefined) patch.role_name = trim(input.role_name);
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  if (input.is_active !== undefined) patch.is_active = !!input.is_active;
  if (Object.keys(patch).length === 0)
    return { ok: false, error: "沒有要更新的欄位" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_permission_roles")
    .update(patch)
    .eq("id", id)
    .eq("brand_id", getBrandKey())
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "代碼衝突" };
    return { ok: false, error: `更新角色失敗：${error.message}` };
  }
  if (!data) return { ok: false, error: "找不到角色或無權限" };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function deleteRoleAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_ITEM_PERMISSION_EDIT);
  if (!trim(id)) return { ok: false, error: "缺少角色 id" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("item_permission_roles")
    .delete()
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: `刪除角色失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────
// Features
// ──────────────────────────────────────────────────────────

export type FeatureInput = {
  group_code: string;
  group_name: string;
  group_sort_order?: number;
  feature_code: string;
  feature_name: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
};

export async function createFeatureAction(
  input: FeatureInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_ITEM_PERMISSION_EDIT);
  if (!trim(input.group_code) || !trim(input.group_name))
    return { ok: false, error: "群組代碼與名稱必填" };
  if (!trim(input.feature_code) || !trim(input.feature_name))
    return { ok: false, error: "功能代碼與名稱必填" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_permission_features")
    .insert({
      brand_id: getBrandKey(),
      group_code: trim(input.group_code).toLowerCase(),
      group_name: trim(input.group_name),
      group_sort_order: input.group_sort_order ?? 99,
      feature_code: trim(input.feature_code).toLowerCase(),
      feature_name: trim(input.feature_name),
      description: nullable(input.description),
      sort_order: input.sort_order ?? 99,
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "功能代碼已存在" };
    return { ok: false, error: `建立功能失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateFeatureAction(
  id: string,
  input: Partial<FeatureInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_ITEM_PERMISSION_EDIT);
  if (!trim(id)) return { ok: false, error: "缺少功能 id" };

  const patch: Record<string, unknown> = {};
  if (input.group_code !== undefined)
    patch.group_code = trim(input.group_code).toLowerCase();
  if (input.group_name !== undefined) patch.group_name = trim(input.group_name);
  if (input.group_sort_order !== undefined)
    patch.group_sort_order = input.group_sort_order;
  if (input.feature_code !== undefined)
    patch.feature_code = trim(input.feature_code).toLowerCase();
  if (input.feature_name !== undefined)
    patch.feature_name = trim(input.feature_name);
  if (input.description !== undefined)
    patch.description = nullable(input.description);
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  if (input.is_active !== undefined) patch.is_active = !!input.is_active;
  if (Object.keys(patch).length === 0)
    return { ok: false, error: "沒有要更新的欄位" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_permission_features")
    .update(patch)
    .eq("id", id)
    .eq("brand_id", getBrandKey())
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "代碼衝突" };
    return { ok: false, error: `更新功能失敗：${error.message}` };
  }
  if (!data) return { ok: false, error: "找不到功能或無權限" };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function deleteFeatureAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_ITEM_PERMISSION_EDIT);
  if (!trim(id)) return { ok: false, error: "缺少功能 id" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("item_permission_features")
    .delete()
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: `刪除功能失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────
// Grants（矩陣 cell）— 批次儲存
// ──────────────────────────────────────────────────────────

export type GrantPatch = {
  feature_id: string;
  role_id: string;
  granted: boolean;
};

export async function bulkSaveGrantsAction(
  patches: GrantPatch[],
): Promise<ActionResult<{ updated: number }>> {
  await requirePermission(PERMISSIONS.PARTS_ITEM_PERMISSION_EDIT);
  if (!Array.isArray(patches) || patches.length === 0)
    return { ok: false, error: "沒有要儲存的變更" };

  const supabase = await createClient();
  const brand = getBrandKey();
  const rows = patches
    .filter((p) => p.feature_id && p.role_id)
    .map((p) => ({
      brand_id: brand,
      feature_id: p.feature_id,
      role_id: p.role_id,
      granted: !!p.granted,
    }));

  if (rows.length === 0) return { ok: false, error: "資料無效" };

  // upsert on PK (feature_id, role_id)
  const { error } = await supabase
    .from("item_permission_grants")
    .upsert(rows, { onConflict: "feature_id,role_id" });

  if (error)
    return { ok: false, error: `儲存權限矩陣失敗：${error.message}` };

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { updated: rows.length } };
}

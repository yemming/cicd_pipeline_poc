"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
export type DictionaryKind = "category" | "control_level" | "uom";

export type DictionaryRow = {
  id: string;
  brand_id: string;
  kind: DictionaryKind;
  code: string;
  label: string;
  description: string | null;
  accent_color: string | null;
  sort_order: number;
  is_active: boolean;
};

export type DictionaryInput = {
  kind: DictionaryKind;
  code: string;
  label: string;
  description?: string | null;
  accent_color?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/setup/dictionaries";
const ITEMS_PATH = "/parts/setup/items";

const KIND_LABEL: Record<DictionaryKind, string> = {
  category: "品類",
  control_level: "管控等級",
  uom: "單位",
};

export async function createDictionaryAction(
  input: DictionaryInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!input.code?.trim()) return { ok: false, error: "代碼必填" };
  if (!input.label?.trim()) return { ok: false, error: "顯示名稱必填" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_dictionary")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
      kind: input.kind,
      code: input.code.trim(),
      label: input.label.trim(),
      description: input.description?.trim() || null,
      accent_color: input.accent_color?.trim() || null,
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `此 ${KIND_LABEL[input.kind]} 代碼已存在` };
    }
    return { ok: false, error: `建立失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  revalidatePath(ITEMS_PATH);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateDictionaryAction(
  id: string,
  patch: Partial<DictionaryInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const upd: Record<string, unknown> = {};
  if (patch.code !== undefined) upd.code = patch.code.trim();
  if (patch.label !== undefined) upd.label = patch.label.trim();
  if (patch.description !== undefined)
    upd.description = patch.description?.trim() || null;
  if (patch.accent_color !== undefined)
    upd.accent_color = patch.accent_color?.trim() || null;
  if (patch.sort_order !== undefined) upd.sort_order = patch.sort_order;
  if (patch.is_active !== undefined) upd.is_active = patch.is_active;
  if (Object.keys(upd).length === 0) return { ok: true, data: { id } };
  const { error } = await supabase
    .from("parts_dictionary")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "此代碼已存在" };
    return { ok: false, error: `儲存失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  revalidatePath(ITEMS_PATH);
  return { ok: true, data: { id } };
}

export async function setDictionaryActiveAction(
  id: string,
  is_active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_dictionary")
    .update({ is_active })
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  revalidatePath(ITEMS_PATH);
  return { ok: true, data: { id } };
}

export async function deleteDictionaryAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // Reference check: don't delete a code that's still in use on items
  const { data: row, error: rowErr } = await supabase
    .from("parts_dictionary")
    .select("kind, code")
    .eq("id", id)
    .eq("brand_id", brand)
    .single();
  if (rowErr || !row) return { ok: false, error: "找不到該項目" };

  const kind = row.kind as DictionaryKind;
  const code = row.code as string;
  let usedCount = 0;
  if (kind === "category") {
    const { count } = await supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .eq("category", code);
    usedCount = count ?? 0;
  } else if (kind === "uom") {
    const { count } = await supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .eq("base_uom", code);
    usedCount = count ?? 0;
  } else if (kind === "control_level") {
    const { count } = await supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .eq("control_type", code);
    usedCount = count ?? 0;
  }
  if (usedCount > 0) {
    return {
      ok: false,
      error: `無法刪除：尚有 ${usedCount} 筆商品使用「${code}」，請先停用或改值`,
    };
  }

  const { error } = await supabase
    .from("parts_dictionary")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  revalidatePath(ITEMS_PATH);
  return { ok: true, data: { id } };
}

export async function reorderDictionaryAction(
  updates: { id: string; sort_order: number }[],
): Promise<ActionResult<{ updated: number }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!updates.length) return { ok: true, data: { updated: 0 } };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  let updated = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from("parts_dictionary")
      .update({ sort_order: u.sort_order })
      .eq("id", u.id)
      .eq("brand_id", brand);
    if (!error) updated++;
  }
  revalidatePath(PAGE_PATH);
  revalidatePath(ITEMS_PATH);
  return { ok: true, data: { updated } };
}

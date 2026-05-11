"use server";

/**
 * Domain Helper — Parts Dictionaries（備件主檔下拉選單對應）
 *
 * 取代 src/lib/parts-setup/dictionary-actions.ts（2026-05-11 升級）
 * 提案：docs/proposals/feature-dictionaries-2026-05-11.md
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/rbac/policies";
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

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const KIND_LABEL: Record<DictionaryKind, string> = {
  category: "品類",
  control_level: "管控等級",
  uom: "單位",
};

const REVALIDATE_PATHS = ["/parts/setup/dictionaries", "/parts/setup/items"];
function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

function mapDbError(error: { code?: string; message: string }, kind: DictionaryKind | null, fallback: string): string {
  if (error.code === "23505") {
    return kind ? `此 ${KIND_LABEL[kind]} 代碼已存在` : "此代碼已存在";
  }
  if (error.code === "23503") return "參照的關聯不存在";
  if (error.code === "23514") return `欄位驗證失敗：${error.message}`;
  return `${fallback}：${error.message}`;
}

// ──────────────────────────────────────────────────────────────────────────
// READ
// ──────────────────────────────────────────────────────────────────────────

export async function listDictionaries(filter: { kind?: DictionaryKind } = {}): Promise<DictionaryRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  let q = supabase
    .from("parts_dictionary")
    .select("id, brand_id, kind, code, label, description, accent_color, sort_order, is_active")
    .eq("brand_id", scope.brand_id);
  if (filter.kind) q = q.eq("kind", filter.kind);
  const { data, error } = await q.order("kind").order("sort_order");
  if (error) throw error;
  return (data ?? []) as unknown as DictionaryRow[];
}

/**
 * 算每筆 dictionary row 被 items 表引用的次數。
 *
 * kind → items 表欄位：
 *   category → items.category
 *   uom → items.base_uom
 *   control_level → items.control_type
 *
 * 回傳 `{ [dictRowId]: count }`，0 引用的 row 不會出現在 map 裡（隱含 = 0）。
 */
export async function getDictionaryReferenceCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const [dictRes, itemsRes] = await Promise.all([
    supabase
      .from("parts_dictionary")
      .select("id, kind, code")
      .eq("brand_id", scope.brand_id),
    supabase
      .from("items")
      .select("category, base_uom, control_type")
      .eq("brand_id", scope.brand_id),
  ]);
  if (dictRes.error) throw dictRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const categoryCount = new Map<string, number>();
  const uomCount = new Map<string, number>();
  const controlCount = new Map<string, number>();
  for (const it of itemsRes.data ?? []) {
    if (it.category) categoryCount.set(it.category, (categoryCount.get(it.category) ?? 0) + 1);
    if (it.base_uom) uomCount.set(it.base_uom, (uomCount.get(it.base_uom) ?? 0) + 1);
    if (it.control_type) controlCount.set(it.control_type, (controlCount.get(it.control_type) ?? 0) + 1);
  }

  const result: Record<string, number> = {};
  for (const d of dictRes.data ?? []) {
    const kind = d.kind as DictionaryKind;
    const map = kind === "category" ? categoryCount : kind === "uom" ? uomCount : controlCount;
    const n = map.get(d.code) ?? 0;
    if (n > 0) result[d.id] = n;
  }
  return result;
}

export async function getDictionariesPageData(): Promise<{
  rows: DictionaryRow[];
  canEdit: boolean;
  referenceCounts: Record<string, number>;
}> {
  const [rows, canEdit, referenceCounts] = await Promise.all([
    listDictionaries(),
    hasPermission(PERMISSIONS.ITEM_EDIT),
    getDictionaryReferenceCounts(),
  ]);
  return { rows, canEdit, referenceCounts };
}

// ──────────────────────────────────────────────────────────────────────────
// WRITE
// ──────────────────────────────────────────────────────────────────────────

export async function addDictionary(input: DictionaryInput): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!input.code?.trim()) return { ok: false, error: "代碼必填" };
  if (!input.label?.trim()) return { ok: false, error: "顯示名稱必填" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("parts_dictionary")
    .insert({
      brand_id: scope.brand_id,
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
  if (error) return { ok: false, error: mapDbError(error, input.kind, "建立失敗") };

  revalidateAll();
  return { ok: true, data: { id: data.id as string } };
}

export async function updateDictionary(
  id: string,
  patch: Partial<DictionaryInput>,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  // 如果要改 code，先檢查是否被 items 引用 — 被引用的不能改 code（會 orphan）
  if (patch.code !== undefined) {
    const { data: existing, error: exErr } = await supabase
      .from("parts_dictionary")
      .select("kind, code")
      .eq("id", id)
      .eq("brand_id", scope.brand_id)
      .single();
    if (exErr || !existing) return { ok: false, error: "找不到該項目" };

    const newCode = patch.code.trim();
    if (newCode !== existing.code) {
      const kind = existing.kind as DictionaryKind;
      const kindToColumn: Record<DictionaryKind, "category" | "base_uom" | "control_type"> = {
        category: "category",
        uom: "base_uom",
        control_level: "control_type",
      };
      const col = kindToColumn[kind];
      if (col) {
        const { count } = await supabase
          .from("items")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", scope.brand_id)
          .eq(col, existing.code);
        if ((count ?? 0) > 0) {
          return {
            ok: false,
            error: `無法改代碼：尚有 ${count} 筆商品使用「${existing.code}」，請先把商品改用新代碼`,
          };
        }
      }
    }
  }

  const upd: Record<string, unknown> = {};
  if (patch.code !== undefined) upd.code = patch.code.trim();
  if (patch.label !== undefined) upd.label = patch.label.trim();
  if (patch.description !== undefined) upd.description = patch.description?.trim() || null;
  if (patch.accent_color !== undefined) upd.accent_color = patch.accent_color?.trim() || null;
  if (patch.sort_order !== undefined) upd.sort_order = patch.sort_order;
  if (patch.is_active !== undefined) upd.is_active = patch.is_active;
  if (Object.keys(upd).length === 0) return { ok: true, data: { id } };

  const { error } = await supabase
    .from("parts_dictionary")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, null, "儲存失敗") };

  revalidateAll();
  return { ok: true, data: { id } };
}

export async function setDictionaryActive(
  id: string,
  isActive: boolean,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { error } = await supabase
    .from("parts_dictionary")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, null, "更新失敗") };

  revalidateAll();
  return { ok: true, data: { id } };
}

export async function deleteDictionary(id: string): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);

  const supabase = await createClient();
  const scope = await getActiveScope();

  // Reference check：被 items 用就擋
  const { data: row, error: rowErr } = await supabase
    .from("parts_dictionary")
    .select("kind, code")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .single();
  if (rowErr || !row) return { ok: false, error: "找不到該項目" };

  const kind = row.kind as DictionaryKind;
  const code = row.code as string;
  const kindToColumn: Record<DictionaryKind, "category" | "base_uom" | "control_type"> = {
    category: "category",
    uom: "base_uom",
    control_level: "control_type",
  };
  const col = kindToColumn[kind];
  if (col) {
    const { count } = await supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", scope.brand_id)
      .eq(col, code);
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error: `無法刪除：尚有 ${count} 筆商品使用「${code}」，請先停用或改值`,
      };
    }
  }

  const { error } = await supabase
    .from("parts_dictionary")
    .delete()
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, null, "刪除失敗") };

  revalidateAll();
  return { ok: true, data: { id } };
}

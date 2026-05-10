"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/setup/warehouse-arch";

const ALLOWED_COLORS = new Set([
  "red",
  "amber",
  "teal",
  "green",
  "navy",
  "gray",
  "blue",
]);
function pickColor(v: string | undefined, fallback: string): string {
  return ALLOWED_COLORS.has(String(v)) ? (v as string) : fallback;
}
function trim(v: string | null | undefined): string {
  return (v ?? "").trim();
}
function nullable(v: string | null | undefined): string | null {
  const s = trim(v);
  return s.length === 0 ? null : s;
}

export type LayerMetaInput = {
  layer_index: number;
  layer_title: string;
  layer_name: string;
  icon?: string;
  description?: string;
  badge_text?: string;
  badge_color?: string;
  accent_color?: string;
  is_active?: boolean;
};

export async function upsertLayerMetaAction(
  id: string | null,
  input: LayerMetaInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_WAREHOUSE_ARCH_EDIT);
  if (!Number.isInteger(input.layer_index) || input.layer_index < 1)
    return { ok: false, error: "層級索引需為正整數" };
  if (!trim(input.layer_title) || !trim(input.layer_name))
    return { ok: false, error: "層級標題與名稱必填" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const payload = {
    brand_id: brand,
    layer_index: input.layer_index,
    layer_title: trim(input.layer_title),
    layer_name: trim(input.layer_name),
    icon: nullable(input.icon),
    description: nullable(input.description),
    badge_text: nullable(input.badge_text),
    badge_color: pickColor(input.badge_color, "navy"),
    accent_color: pickColor(input.accent_color, "navy"),
    is_active: input.is_active ?? true,
  };

  if (id) {
    const { data, error } = await supabase
      .from("parts_warehouse_layer_meta")
      .update(payload)
      .eq("id", id)
      .eq("brand_id", brand)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return { ok: false, error: "層級索引衝突" };
      return { ok: false, error: `更新層級失敗：${error.message}` };
    }
    if (!data) return { ok: false, error: "找不到層級或無權限" };
    revalidatePath(PAGE_PATH);
    return { ok: true, data: { id: data.id } };
  }

  const { data, error } = await supabase
    .from("parts_warehouse_layer_meta")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "層級索引已存在" };
    return { ok: false, error: `建立層級失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function deleteLayerMetaAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_WAREHOUSE_ARCH_EDIT);
  if (!trim(id)) return { ok: false, error: "缺少層級 id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_warehouse_layer_meta")
    .delete()
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: `刪除層級失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

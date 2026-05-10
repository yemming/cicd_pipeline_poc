"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/setup/control-types";

const ALLOWED_COLORS = new Set([
  "red",
  "amber",
  "teal",
  "green",
  "navy",
  "gray",
]);

function trim(v: string | null | undefined): string {
  return (v ?? "").trim();
}
function nullable(v: string | null | undefined): string | null {
  const s = trim(v);
  return s.length === 0 ? null : s;
}
function pickColor(v: string | undefined, fallback: string): string {
  return ALLOWED_COLORS.has(String(v)) ? (v as string) : fallback;
}
function parsePct(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number")
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
  const cleaned = String(v).trim().replace(/%|\s/g, "");
  if (cleaned.length === 0) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

export type ControlTypeInput = {
  class_code: string;
  class_name: string;
  price_basis?: string;
  count_frequency?: string;
  serial_tracking_label?: string;
  serial_tracking_color?: string;
  issue_review_label?: string;
  issue_review_color?: string;
  tolerance_pct?: string | number | null;
  example_text?: string;
  accent_color?: string;
  is_active?: boolean;
  sort_order?: number;
};

export async function createControlTypeAction(
  input: ControlTypeInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_CONTROL_TYPE_EDIT);
  if (!trim(input.class_code)) return { ok: false, error: "類別代碼必填" };
  if (!trim(input.class_name)) return { ok: false, error: "類別名稱必填" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_control_types")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
      class_code: trim(input.class_code).toUpperCase(),
      class_name: trim(input.class_name),
      price_basis: nullable(input.price_basis),
      count_frequency: nullable(input.count_frequency),
      serial_tracking_label: nullable(input.serial_tracking_label),
      serial_tracking_color: pickColor(input.serial_tracking_color, "gray"),
      issue_review_label: nullable(input.issue_review_label),
      issue_review_color: pickColor(input.issue_review_color, "gray"),
      tolerance_pct: parsePct(input.tolerance_pct ?? null),
      example_text: nullable(input.example_text),
      accent_color: pickColor(input.accent_color, "gray"),
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 99,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "此類別代碼已存在" };
    return { ok: false, error: `建立類別失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateControlTypeAction(
  id: string,
  input: Partial<ControlTypeInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_CONTROL_TYPE_EDIT);
  if (!trim(id)) return { ok: false, error: "缺少類別 id" };

  const patch: Record<string, unknown> = {};
  if (input.class_code !== undefined)
    patch.class_code = trim(input.class_code).toUpperCase();
  if (input.class_name !== undefined) patch.class_name = trim(input.class_name);
  if (input.price_basis !== undefined)
    patch.price_basis = nullable(input.price_basis);
  if (input.count_frequency !== undefined)
    patch.count_frequency = nullable(input.count_frequency);
  if (input.serial_tracking_label !== undefined)
    patch.serial_tracking_label = nullable(input.serial_tracking_label);
  if (input.serial_tracking_color !== undefined)
    patch.serial_tracking_color = pickColor(input.serial_tracking_color, "gray");
  if (input.issue_review_label !== undefined)
    patch.issue_review_label = nullable(input.issue_review_label);
  if (input.issue_review_color !== undefined)
    patch.issue_review_color = pickColor(input.issue_review_color, "gray");
  if (input.tolerance_pct !== undefined)
    patch.tolerance_pct = parsePct(input.tolerance_pct);
  if (input.example_text !== undefined)
    patch.example_text = nullable(input.example_text);
  if (input.accent_color !== undefined)
    patch.accent_color = pickColor(input.accent_color, "gray");
  if (input.is_active !== undefined) patch.is_active = !!input.is_active;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;

  if (Object.keys(patch).length === 0)
    return { ok: false, error: "沒有要更新的欄位" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_control_types")
    .update(patch)
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "代碼衝突" };
    return { ok: false, error: `更新類別失敗：${error.message}` };
  }
  if (!data) return { ok: false, error: "找不到類別或無權限" };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function deleteControlTypeAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_CONTROL_TYPE_EDIT);
  if (!trim(id)) return { ok: false, error: "缺少類別 id" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_control_types")
    .delete()
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: `刪除類別失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

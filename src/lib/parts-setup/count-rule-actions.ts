"use server";

import { revalidatePath } from "next/cache";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/setup/count-rules";

function trim(v: string | null | undefined): string {
  return (v ?? "").trim();
}
function nullable(v: string | null | undefined): string | null {
  const s = trim(v);
  return s.length === 0 ? null : s;
}
/** 把「3」「3%」「3.5%」「 5 」 → 3 / 3.5 / 5；非數字回 null。0~100 之間。 */
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

// ──────────────────────────────────────────────────────────
// 1) 容許區間（singleton per brand）
// ──────────────────────────────────────────────────────────

export type ToleranceInput = {
  tolerance_a_pct: string | number;
  tolerance_b_pct: string | number;
  tolerance_c_pct: string | number;
  warning_text?: string;
  notes?: string;
};

export async function upsertToleranceAction(
  input: ToleranceInput,
): Promise<ActionResult<{ brand_id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_COUNT_RULE_EDIT);

  const a = parsePct(input.tolerance_a_pct);
  const b = parsePct(input.tolerance_b_pct);
  const c = parsePct(input.tolerance_c_pct);
  if (a === null) return { ok: false, error: "A 類容許率需為 0–100 之數字" };
  if (b === null) return { ok: false, error: "B 類容許率需為 0–100 之數字" };
  if (c === null) return { ok: false, error: "C 類容許率需為 0–100 之數字" };

  const supabase = await createClient();
  const brand = getBrandKey();
  const { error } = await supabase.from("count_tolerance_config").upsert(
    {
      brand_id: brand,
      tolerance_a_pct: a,
      tolerance_b_pct: b,
      tolerance_c_pct: c,
      warning_text: nullable(input.warning_text),
      notes: nullable(input.notes),
    },
    { onConflict: "brand_id" },
  );

  if (error) return { ok: false, error: `儲存容許區間失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { brand_id: brand } };
}

// ──────────────────────────────────────────────────────────
// 2) 審核流程規則 CRUD
// ──────────────────────────────────────────────────────────

export type ReviewRuleInput = {
  rule_code: string;
  rule_name: string;
  description?: string;
  badge_label: string;
  badge_color?: string;
  panel_color?: string;
  action?: string;
  is_active?: boolean;
  sort_order?: number;
};

const ALLOWED_COLORS = new Set([
  "green",
  "amber",
  "red",
  "navy",
  "teal",
  "gray",
]);
function pickColor(v: string | undefined, fallback: string): string {
  return ALLOWED_COLORS.has(String(v)) ? (v as string) : fallback;
}

export async function createReviewRuleAction(
  input: ReviewRuleInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_COUNT_RULE_EDIT);
  if (!trim(input.rule_code)) return { ok: false, error: "規則代碼必填" };
  if (!trim(input.rule_name)) return { ok: false, error: "規則名稱必填" };
  if (!trim(input.badge_label))
    return { ok: false, error: "徽章文字必填" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("count_review_rules")
    .insert({
      brand_id: getBrandKey(),
      rule_code: trim(input.rule_code).toLowerCase(),
      rule_name: trim(input.rule_name),
      description: nullable(input.description),
      badge_label: trim(input.badge_label),
      badge_color: pickColor(input.badge_color, "navy"),
      panel_color: pickColor(input.panel_color, "gray"),
      action: nullable(input.action),
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 99,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "規則代碼已存在" };
    return { ok: false, error: `建立規則失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateReviewRuleAction(
  id: string,
  input: Partial<ReviewRuleInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_COUNT_RULE_EDIT);
  if (!trim(id)) return { ok: false, error: "缺少規則 id" };

  const patch: Record<string, unknown> = {};
  if (input.rule_code !== undefined)
    patch.rule_code = trim(input.rule_code).toLowerCase();
  if (input.rule_name !== undefined) patch.rule_name = trim(input.rule_name);
  if (input.description !== undefined)
    patch.description = nullable(input.description);
  if (input.badge_label !== undefined)
    patch.badge_label = trim(input.badge_label);
  if (input.badge_color !== undefined)
    patch.badge_color = pickColor(input.badge_color, "navy");
  if (input.panel_color !== undefined)
    patch.panel_color = pickColor(input.panel_color, "gray");
  if (input.action !== undefined) patch.action = nullable(input.action);
  if (input.is_active !== undefined) patch.is_active = !!input.is_active;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;

  if (Object.keys(patch).length === 0)
    return { ok: false, error: "沒有要更新的欄位" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("count_review_rules")
    .update(patch)
    .eq("id", id)
    .eq("brand_id", getBrandKey())
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "規則代碼衝突" };
    return { ok: false, error: `更新規則失敗：${error.message}` };
  }
  if (!data) return { ok: false, error: "找不到規則或無權限" };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function deleteReviewRuleAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_COUNT_RULE_EDIT);
  if (!trim(id)) return { ok: false, error: "缺少規則 id" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("count_review_rules")
    .delete()
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: `刪除規則失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

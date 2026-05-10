"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/setup/purchase-permissions";

// ──────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────

function trim(v: string | null | undefined): string {
  return (v ?? "").trim();
}
function nullable(v: string | null | undefined): string | null {
  const s = trim(v);
  return s.length === 0 ? null : s;
}
/** 把「無上限／空字串」→ null，數字字串 → number。會剝掉 `NT$`、千分位逗號、空白。 */
function parseLimit(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s.length === 0) return null;
  if (/無上限|unlimited|∞|n\/a/i.test(s)) return null;
  const cleaned = s.replace(/NT\$|TWD|\$|,|\s/gi, "");
  if (cleaned.length === 0) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ──────────────────────────────────────────────────────────
// 1) Purchase Permission Rules（角色採購權限）
// ──────────────────────────────────────────────────────────

export type RuleInput = {
  role_code: string;
  role_name: string;
  store_id?: string | null;
  single_limit?: string | number | null;
  monthly_limit?: string | number | null;
  requires_approval?: boolean;
  notes?: string;
  is_active?: boolean;
  sort_order?: number;
};

export async function createRuleAction(
  input: RuleInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_PURCHASE_PERMISSION_EDIT);
  if (!trim(input.role_code)) return { ok: false, error: "角色代碼必填" };
  if (!trim(input.role_name)) return { ok: false, error: "角色名稱必填" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_permission_rules")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
      role_code: trim(input.role_code).toLowerCase(),
      role_name: trim(input.role_name),
      store_id: nullable(input.store_id ?? null),
      single_limit: parseLimit(input.single_limit ?? null),
      monthly_limit: parseLimit(input.monthly_limit ?? null),
      requires_approval: input.requires_approval ?? false,
      notes: nullable(input.notes),
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 99,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "同 brand 下此角色（或角色 × 門店）已存在" };
    return { ok: false, error: `建立規則失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateRuleAction(
  id: string,
  input: Partial<RuleInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_PURCHASE_PERMISSION_EDIT);
  if (!trim(id)) return { ok: false, error: "缺少規則 id" };

  const patch: Record<string, unknown> = {};
  if (input.role_code !== undefined)
    patch.role_code = trim(input.role_code).toLowerCase();
  if (input.role_name !== undefined) patch.role_name = trim(input.role_name);
  if (input.store_id !== undefined)
    patch.store_id = nullable(input.store_id ?? null);
  if (input.single_limit !== undefined)
    patch.single_limit = parseLimit(input.single_limit);
  if (input.monthly_limit !== undefined)
    patch.monthly_limit = parseLimit(input.monthly_limit);
  if (input.requires_approval !== undefined)
    patch.requires_approval = !!input.requires_approval;
  if (input.notes !== undefined) patch.notes = nullable(input.notes);
  if (input.is_active !== undefined) patch.is_active = !!input.is_active;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;

  if (Object.keys(patch).length === 0)
    return { ok: false, error: "沒有要更新的欄位" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_permission_rules")
    .update(patch)
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "更新後與既有規則衝突" };
    return { ok: false, error: `更新規則失敗：${error.message}` };
  }
  if (!data) return { ok: false, error: "找不到規則或無權限" };

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function deleteRuleAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_PURCHASE_PERMISSION_EDIT);
  if (!trim(id)) return { ok: false, error: "缺少規則 id" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_permission_rules")
    .delete()
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);

  if (error) return { ok: false, error: `刪除規則失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

/** 表單一次儲存：批次上傳所有規則的 limit / requires_approval。 */
export type RuleBulkPatch = {
  id: string;
  single_limit?: string | number | null;
  monthly_limit?: string | number | null;
  requires_approval?: boolean;
};
export async function bulkUpdateRulesAction(
  patches: RuleBulkPatch[],
): Promise<ActionResult<{ updated: number }>> {
  await requirePermission(PERMISSIONS.PARTS_PURCHASE_PERMISSION_EDIT);
  if (!Array.isArray(patches) || patches.length === 0)
    return { ok: false, error: "沒有要儲存的變更" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  let updated = 0;
  for (const p of patches) {
    if (!p.id) continue;
    const patch: Record<string, unknown> = {};
    if (p.single_limit !== undefined)
      patch.single_limit = parseLimit(p.single_limit);
    if (p.monthly_limit !== undefined)
      patch.monthly_limit = parseLimit(p.monthly_limit);
    if (p.requires_approval !== undefined)
      patch.requires_approval = !!p.requires_approval;
    if (Object.keys(patch).length === 0) continue;

    const { error } = await supabase
      .from("purchase_permission_rules")
      .update(patch)
      .eq("id", p.id)
      .eq("brand_id", brand);
    if (error) return { ok: false, error: `儲存第 ${p.id} 失敗：${error.message}` };
    updated += 1;
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { updated } };
}

// ──────────────────────────────────────────────────────────
// 2) Purchase Approval Flows（採購類型審核流程）
// ──────────────────────────────────────────────────────────

export type FlowStep = { label: string; color?: string };

export type FlowInput = {
  flow_type: string;
  flow_name: string;
  description?: string;
  color_tag?: string; // green | amber | red | navy | teal
  emoji?: string;
  steps?: FlowStep[];
  is_active?: boolean;
  sort_order?: number;
};

const ALLOWED_COLORS = new Set(["green", "amber", "red", "navy", "teal", "gray"]);
function sanitizeSteps(steps: FlowStep[] | undefined): FlowStep[] {
  if (!Array.isArray(steps)) return [];
  return steps
    .map((s) => ({
      label: trim(s?.label),
      color: ALLOWED_COLORS.has(String(s?.color)) ? s.color : "navy",
    }))
    .filter((s) => s.label.length > 0);
}

export async function createFlowAction(
  input: FlowInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_PURCHASE_PERMISSION_EDIT);
  if (!trim(input.flow_type)) return { ok: false, error: "流程代碼必填" };
  if (!trim(input.flow_name)) return { ok: false, error: "流程名稱必填" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_approval_flows")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
      flow_type: trim(input.flow_type).toLowerCase(),
      flow_name: trim(input.flow_name),
      description: nullable(input.description),
      color_tag: ALLOWED_COLORS.has(String(input.color_tag))
        ? input.color_tag
        : "navy",
      emoji: nullable(input.emoji),
      steps: sanitizeSteps(input.steps),
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 99,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "此流程代碼已存在" };
    return { ok: false, error: `建立流程失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateFlowAction(
  id: string,
  input: Partial<FlowInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_PURCHASE_PERMISSION_EDIT);
  if (!trim(id)) return { ok: false, error: "缺少流程 id" };

  const patch: Record<string, unknown> = {};
  if (input.flow_type !== undefined)
    patch.flow_type = trim(input.flow_type).toLowerCase();
  if (input.flow_name !== undefined) patch.flow_name = trim(input.flow_name);
  if (input.description !== undefined)
    patch.description = nullable(input.description);
  if (input.color_tag !== undefined)
    patch.color_tag = ALLOWED_COLORS.has(String(input.color_tag))
      ? input.color_tag
      : "navy";
  if (input.emoji !== undefined) patch.emoji = nullable(input.emoji);
  if (input.steps !== undefined) patch.steps = sanitizeSteps(input.steps);
  if (input.is_active !== undefined) patch.is_active = !!input.is_active;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;

  if (Object.keys(patch).length === 0)
    return { ok: false, error: "沒有要更新的欄位" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_approval_flows")
    .update(patch)
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "更新後與既有流程衝突" };
    return { ok: false, error: `更新流程失敗：${error.message}` };
  }
  if (!data) return { ok: false, error: "找不到流程或無權限" };

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function deleteFlowAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_PURCHASE_PERMISSION_EDIT);
  if (!trim(id)) return { ok: false, error: "缺少流程 id" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_approval_flows")
    .delete()
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);

  if (error) return { ok: false, error: `刪除流程失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

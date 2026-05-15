"use server";

/**
 * Server actions — RO Numbering Rules（工單編號規則 P1 / P2 前綴）
 *
 * 寫入 business_rules 表，rule_kind = 'ro_prefix_p1' / 'ro_prefix_p2'
 * 權限走 RO_DISPATCH（=管理員 / 售後主管才能改編號規則）
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  requirePermission,
  getCurrentUserContext,
} from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  validatePrefixCode,
  type AcctType,
} from "@/domain/ro-numbering.constants";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/aftersales/management/ro-numbering";

export type P1Input = {
  code: string;
  name: string;
  acct_type: AcctType;
  acct_label: string;
  note: string;
  sort_order: number;
  is_active: boolean;
};

export type P2Input = {
  code: string;
  name: string;
  target: string;
  note: string;
  sort_order: number;
  is_active: boolean;
};

function trim(v: string | null | undefined): string {
  return v == null ? "" : String(v).trim();
}

function mapDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "代碼重複，請改一個";
  return `儲存失敗：${error.message}`;
}

async function checkUniqueCode(
  brand: string,
  rule_kind: "ro_prefix_p1" | "ro_prefix_p2",
  code: string,
  excludeId: string | null,
): Promise<string | null> {
  const supabase = await createClient();
  const q = supabase
    .from("business_rules")
    .select("id, config")
    .eq("brand_id", brand)
    .eq("rule_kind", rule_kind);
  const { data, error } = await q;
  if (error) return null; // 唯一性驗證失敗就讓 DB constraint 接住
  const dup = (data ?? []).some((r) => {
    if (excludeId && r.id === excludeId) return false;
    const c = (r.config as { code?: string }).code;
    return typeof c === "string" && c.toUpperCase() === code.toUpperCase();
  });
  return dup ? "代碼重複，請改一個" : null;
}

/* ───────────── P1 ───────────── */

export async function createP1Action(
  input: P1Input,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const code = trim(input.code).toUpperCase();
  const codeErr = validatePrefixCode(code);
  if (codeErr) return { ok: false, error: codeErr };
  if (!trim(input.name)) return { ok: false, error: "業務類型名稱必填" };

  const brand = (await getActiveScope()).brand_id;
  const dup = await checkUniqueCode(brand, "ro_prefix_p1", code, null);
  if (dup) return { ok: false, error: dup };

  const ctx = await getCurrentUserContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_rules")
    .insert({
      brand_id: brand,
      rule_kind: "ro_prefix_p1",
      config: {
        code,
        name: trim(input.name),
        acct_type: input.acct_type,
        acct_label: trim(input.acct_label),
        note: trim(input.note),
      },
      metadata: {},
      is_active: input.is_active,
      sort_order: input.sort_order,
      created_by: ctx.userId ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error) };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateP1Action(
  id: string,
  input: P1Input,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const code = trim(input.code).toUpperCase();
  const codeErr = validatePrefixCode(code);
  if (codeErr) return { ok: false, error: codeErr };
  if (!trim(input.name)) return { ok: false, error: "業務類型名稱必填" };

  const brand = (await getActiveScope()).brand_id;
  const dup = await checkUniqueCode(brand, "ro_prefix_p1", code, id);
  if (dup) return { ok: false, error: dup };

  const ctx = await getCurrentUserContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("business_rules")
    .update({
      config: {
        code,
        name: trim(input.name),
        acct_type: input.acct_type,
        acct_label: trim(input.acct_label),
        note: trim(input.note),
      },
      is_active: input.is_active,
      sort_order: input.sort_order,
      updated_by: ctx.userId ?? null,
    })
    .eq("id", id)
    .eq("brand_id", brand)
    .eq("rule_kind", "ro_prefix_p1");
  if (error) return { ok: false, error: mapDbError(error) };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function setP1ActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { error } = await supabase
    .from("business_rules")
    .update({ is_active: active })
    .eq("id", id)
    .eq("brand_id", brand)
    .eq("rule_kind", "ro_prefix_p1");
  if (error) return { ok: false, error: mapDbError(error) };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function deleteP1Action(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { error } = await supabase
    .from("business_rules")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand)
    .eq("rule_kind", "ro_prefix_p1");
  if (error) {
    if (error.code === "23503")
      return {
        ok: false,
        error: "此前綴碼已被工單引用，無法刪除（建議改成停用）",
      };
    return { ok: false, error: mapDbError(error) };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

/* ───────────── P2 ───────────── */

export async function createP2Action(
  input: P2Input,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const code = trim(input.code).toUpperCase();
  const codeErr = validatePrefixCode(code);
  if (codeErr) return { ok: false, error: codeErr };
  if (!trim(input.name)) return { ok: false, error: "付款性質名稱必填" };

  const brand = (await getActiveScope()).brand_id;
  const dup = await checkUniqueCode(brand, "ro_prefix_p2", code, null);
  if (dup) return { ok: false, error: dup };

  const ctx = await getCurrentUserContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_rules")
    .insert({
      brand_id: brand,
      rule_kind: "ro_prefix_p2",
      config: {
        code,
        name: trim(input.name),
        target: trim(input.target),
        note: trim(input.note),
      },
      metadata: {},
      is_active: input.is_active,
      sort_order: input.sort_order,
      created_by: ctx.userId ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error) };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateP2Action(
  id: string,
  input: P2Input,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const code = trim(input.code).toUpperCase();
  const codeErr = validatePrefixCode(code);
  if (codeErr) return { ok: false, error: codeErr };
  if (!trim(input.name)) return { ok: false, error: "付款性質名稱必填" };

  const brand = (await getActiveScope()).brand_id;
  const dup = await checkUniqueCode(brand, "ro_prefix_p2", code, id);
  if (dup) return { ok: false, error: dup };

  const ctx = await getCurrentUserContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("business_rules")
    .update({
      config: {
        code,
        name: trim(input.name),
        target: trim(input.target),
        note: trim(input.note),
      },
      is_active: input.is_active,
      sort_order: input.sort_order,
      updated_by: ctx.userId ?? null,
    })
    .eq("id", id)
    .eq("brand_id", brand)
    .eq("rule_kind", "ro_prefix_p2");
  if (error) return { ok: false, error: mapDbError(error) };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function setP2ActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { error } = await supabase
    .from("business_rules")
    .update({ is_active: active })
    .eq("id", id)
    .eq("brand_id", brand)
    .eq("rule_kind", "ro_prefix_p2");
  if (error) return { ok: false, error: mapDbError(error) };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function deleteP2Action(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { error } = await supabase
    .from("business_rules")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand)
    .eq("rule_kind", "ro_prefix_p2");
  if (error) {
    if (error.code === "23503")
      return {
        ok: false,
        error: "此前綴碼已被工單引用，無法刪除（建議改成停用）",
      };
    return { ok: false, error: mapDbError(error) };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

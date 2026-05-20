"use server";

/**
 * Server Actions — 售後客戶基盤（/aftersales/crm/customer-base）
 *
 * 行為跟 sales/customer-base-actions.ts 對稱；不同點：
 *   - revalidate 售後路徑
 *   - 預設 source_module = 'aftersales'
 *   - 共用 PERMISSIONS.CUSTOMER_* 權限（master.customer.*）
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type AftersalesCustomerInput = {
  /** 留空 → 自動產生 C00001 / C00002... */
  code?: string;
  name: string;
  type: "individual" | "corporate";
  tax_id?: string | null;
  national_id?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  birthday?: string | null;
  source_module?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

const LIST_PATH = "/crm/aftersales/customer-base";

function trim(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function mapDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    if (error.message.includes("customers_brand_id_code_key")) return "客戶代碼已存在";
    if (error.message.includes("customers_national_id_uniq")) return "身分證號已存在";
    return "資料重複（unique constraint）";
  }
  return `儲存失敗：${error.message}`;
}

async function genCustomerCode(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("code")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .ilike("code", "C%")
    .order("code", { ascending: false })
    .limit(50);
  let max = 0;
  for (const row of data ?? []) {
    const m = /^C(\d+)$/.exec(row.code);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `C${String(max + 1).padStart(5, "0")}`;
}

function payloadFromInput(input: AftersalesCustomerInput) {
  return {
    name: input.name.trim(),
    type: input.type,
    tax_id: trim(input.tax_id ?? null),
    national_id: trim(input.national_id ?? null),
    phone: trim(input.phone ?? null),
    email: trim(input.email ?? null),
    address: trim(input.address ?? null),
    birthday: trim(input.birthday ?? null),
    source_module: trim(input.source_module ?? null),
    notes: trim(input.notes ?? null),
  };
}

export async function createAftersalesCustomerAction(
  input: AftersalesCustomerInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };
  if (!input.name?.trim()) return { ok: false, error: "客戶名稱必填" };

  const code = input.code?.trim() || (await genCustomerCode());
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
      code,
      ...payloadFromInput(input),
      is_active: input.is_active ?? true,
      created_by: ctx.userId,
      source_module: input.source_module?.trim() || "aftersales",
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: mapDbError(error) };
  revalidatePath(LIST_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateAftersalesCustomerAction(
  id: string,
  input: AftersalesCustomerInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!id) return { ok: false, error: "缺少 customer id" };
  if (!input.name?.trim()) return { ok: false, error: "客戶名稱必填" };
  if (!input.code?.trim()) return { ok: false, error: "客戶代碼必填" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({
      code: input.code.trim(),
      ...payloadFromInput(input),
      ...(input.is_active === undefined ? {} : { is_active: input.is_active }),
    })
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);

  if (error) return { ok: false, error: mapDbError(error) };
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
  return { ok: true, data: { id } };
}

export async function setAftersalesCustomerActiveAction(
  id: string,
  next: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ is_active: next })
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: mapDbError(error) };
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteAftersalesCustomerAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "此客戶被工單／預約／車輛引用，無法刪除。建議改用「停用」保留歷史。",
      };
    }
    return { ok: false, error: mapDbError(error) };
  }
  revalidatePath(LIST_PATH);
  return { ok: true, data: { id } };
}

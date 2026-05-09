"use server";

import { revalidatePath } from "next/cache";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CustomerInput = {
  code?: string;                          // 留空 → 自動產生 C00001 / C00002...
  name: string;
  type: "individual" | "corporate";
  tax_id?: string | null;
  national_id?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  birthday?: string | null;
  source_module?: string | null;
  gl_receivable_account_id?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

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
  if (error.code === "23503" && error.message.includes("gl_receivable_account_id")) {
    return "應收帳款科目不存在";
  }
  return `儲存失敗：${error.message}`;
}

async function genCustomerCode(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("code")
    .eq("brand_id", getBrandKey())
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

function payloadFromInput(input: CustomerInput) {
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
    gl_receivable_account_id: trim(input.gl_receivable_account_id ?? null),
    notes: trim(input.notes ?? null),
  };
}

export async function createCustomerAction(
  input: CustomerInput,
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
      brand_id: getBrandKey(),
      code,
      ...payloadFromInput(input),
      is_active: input.is_active ?? true,
      created_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: mapDbError(error) };

  revalidatePath("/admin/master-data/customers");
  return { ok: true, data: { id: data.id } };
}

export async function updateCustomerAction(
  id: string,
  input: CustomerInput,
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
    .eq("brand_id", getBrandKey());

  if (error) return { ok: false, error: mapDbError(error) };

  revalidatePath("/admin/master-data/customers");
  revalidatePath(`/admin/master-data/customers/${id}`);
  return { ok: true, data: { id } };
}

export async function setCustomerActiveAction(
  id: string,
  next: boolean,
): Promise<ActionResult<null>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ is_active: next })
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: mapDbError(error) };
  revalidatePath("/admin/master-data/customers");
  revalidatePath(`/admin/master-data/customers/${id}`);
  return { ok: true, data: null };
}

export async function deleteCustomerAction(
  id: string,
): Promise<ActionResult<null>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) {
    // FK violation：客戶被工單 / 預約 / 車輛引用，不能 hard delete，引導改用停用
    if (error.code === "23503") {
      return {
        ok: false,
        error: "此客戶被工單／預約／車輛引用，無法刪除。建議改用「停用」保留歷史。",
      };
    }
    return { ok: false, error: mapDbError(error) };
  }
  revalidatePath("/admin/master-data/customers");
  return { ok: true, data: null };
}

"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { SupplierFieldKey } from "./supplier-form-types";

import { getActiveScope } from "@/lib/scope/active-scope";

const SUPPLIER_TYPES = ["oem", "agent", "consumable", "services", "other"] as const;
type SupplierType = (typeof SUPPLIER_TYPES)[number];

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Partial<Record<SupplierFieldKey, string>> };

export type SupplierInput = {
  code?: string | null;
  name: string;
  type?: SupplierType | null;
  tax_id?: string | null;
  primary_contact?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  payment_terms?: string | null;
  default_currency?: string | null;
  gl_payable_coa_id?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

function pickType(raw: string | null | undefined): SupplierType {
  const v = String(raw ?? "agent");
  return (SUPPLIER_TYPES as readonly string[]).includes(v)
    ? (v as SupplierType)
    : "agent";
}

function trim(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function mapDbError(error: { code?: string; message: string }): {
  error: string;
  fieldErrors?: Partial<Record<SupplierFieldKey, string>>;
} {
  if (error.code === "23505" && error.message.includes("suppliers_brand_id_code_key")) {
    return {
      error: "供應商代碼重複",
      fieldErrors: { code: "此代碼已存在，請改一個或留空自動產生" },
    };
  }
  if (error.code === "23503" && error.message.includes("gl_payable_coa_id")) {
    return {
      error: "應付帳款科目不存在",
      fieldErrors: { gl_payable_coa_id: "請重新選擇科目" },
    };
  }
  return { error: `儲存失敗：${error.message}` };
}

async function genSupplierCode(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("code")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .ilike("code", "S%")
    .order("code", { ascending: false })
    .limit(50);
  if (error || !data) return "S00001";
  let max = 0;
  for (const row of data) {
    const m = /^S(\d+)$/.exec(row.code);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `S${String(max + 1).padStart(5, "0")}`;
}

function buildPayload(input: SupplierInput) {
  return {
    name: (input.name ?? "").trim(),
    type: pickType(input.type),
    tax_id: trim(input.tax_id ?? null),
    primary_contact: trim(input.primary_contact ?? null),
    phone: trim(input.phone ?? null),
    email: trim(input.email ?? null),
    address: trim(input.address ?? null),
    payment_terms: trim(input.payment_terms ?? null),
    default_currency: trim(input.default_currency ?? null) ?? "TWD",
    gl_payable_coa_id: trim(input.gl_payable_coa_id ?? null),
    notes: trim(input.notes ?? null),
  };
}

export async function createSupplierAction(
  input: SupplierInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };

  const payload = buildPayload(input);
  const fieldErrors: Partial<Record<SupplierFieldKey, string>> = {};
  if (!payload.name) fieldErrors.name = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "請補齊必填欄位", fieldErrors };
  }

  const codeRaw = trim(input.code ?? null);
  const code = codeRaw ?? (await genSupplierCode());

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      brand_id: scope.brand_id,
      subsidiary_id: scope.subsidiary_id,
      code,
      ...payload,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  revalidatePath("/admin/master-data/suppliers");
  return { ok: true, data: { id: data.id } };
}

export async function updateSupplierAction(
  id: string,
  input: SupplierInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  if (!id) return { ok: false, error: "缺少 supplier id" };

  const payload = buildPayload(input);
  const code = trim(input.code ?? null);
  const fieldErrors: Partial<Record<SupplierFieldKey, string>> = {};
  if (!code) fieldErrors.code = "必填";
  if (!payload.name) fieldErrors.name = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      code,
      ...payload,
      is_active: input.is_active ?? true,
    })
    .eq("id", id);
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  revalidatePath("/admin/master-data/suppliers");
  revalidatePath(`/admin/master-data/suppliers/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteSupplierAction(
  id: string,
): Promise<ActionResult<null>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  if (!id) return { ok: false, error: "缺少 supplier id" };
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "此供應商被其他單據引用，無法刪除。請改用「停用」保留歷史。",
      };
    }
    return { ok: false, error: `刪除失敗：${error.message}` };
  }
  revalidatePath("/admin/master-data/suppliers");
  return { ok: true, data: null };
}

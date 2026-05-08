"use server";

import { revalidatePath } from "next/cache";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/setup/suppliers";

export type SupplierInput = {
  code: string;
  name: string;
  type?: string;
  primary_contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_id?: string;
  payment_terms?: string;
  default_currency?: string;
  notes?: string;
  is_active?: boolean;
};

const trim = (v?: string | null): string => (v ?? "").trim();
const nullable = (v?: string | null): string | null =>
  trim(v).length === 0 ? null : trim(v);

export async function createSupplierAction(
  input: SupplierInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  if (!trim(input.code)) return { ok: false, error: "代碼必填" };
  if (!trim(input.name)) return { ok: false, error: "名稱必填" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      brand_id: getBrandKey(),
      code: trim(input.code).toUpperCase(),
      name: trim(input.name),
      type: nullable(input.type),
      primary_contact: nullable(input.primary_contact),
      phone: nullable(input.phone),
      email: nullable(input.email),
      address: nullable(input.address),
      tax_id: nullable(input.tax_id),
      payment_terms: nullable(input.payment_terms),
      default_currency: nullable(input.default_currency) ?? "TWD",
      notes: nullable(input.notes),
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "此代碼已存在" };
    return { ok: false, error: `建立失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateSupplierAction(
  id: string,
  patch: Partial<SupplierInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const upd: Record<string, unknown> = {};
  if (patch.code !== undefined) upd.code = trim(patch.code).toUpperCase();
  if (patch.name !== undefined) upd.name = trim(patch.name);
  if (patch.type !== undefined) upd.type = nullable(patch.type);
  if (patch.primary_contact !== undefined)
    upd.primary_contact = nullable(patch.primary_contact);
  if (patch.phone !== undefined) upd.phone = nullable(patch.phone);
  if (patch.email !== undefined) upd.email = nullable(patch.email);
  if (patch.address !== undefined) upd.address = nullable(patch.address);
  if (patch.tax_id !== undefined) upd.tax_id = nullable(patch.tax_id);
  if (patch.payment_terms !== undefined) upd.payment_terms = nullable(patch.payment_terms);
  if (patch.default_currency !== undefined)
    upd.default_currency = nullable(patch.default_currency) ?? "TWD";
  if (patch.notes !== undefined) upd.notes = nullable(patch.notes);
  if (patch.is_active !== undefined) upd.is_active = patch.is_active;
  const { error } = await supabase
    .from("suppliers")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function deleteSupplierAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ is_active: false })
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: `停用失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

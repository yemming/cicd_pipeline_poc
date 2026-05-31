"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { CustomerContactFormState } from "./customer-contact-form-types";

import { getActiveScope } from "@/lib/scope/active-scope";
const CONTACT_ROLES = [
  "primary",
  "emergency",
  "family",
  "secretary",
  "other",
] as const;
type ContactRole = (typeof CONTACT_ROLES)[number];

function pickRole(raw: FormDataEntryValue | null): ContactRole {
  const v = String(raw ?? "primary");
  return (CONTACT_ROLES as readonly string[]).includes(v)
    ? (v as ContactRole)
    : "primary";
}

function strOrNull(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  return v.length === 0 ? null : v;
}

function mapDbError(error: { code?: string; message: string }): CustomerContactFormState {
  if (error.code === "23503" && error.message.includes("customer_id")) {
    return { error: "客戶不存在或已被刪除" };
  }
  return { error: `儲存失敗：${error.message}` };
}

function pickPayload(fd: FormData) {
  return {
    role: pickRole(fd.get("role")),
    name: String(fd.get("name") ?? "").trim(),
    phone: strOrNull(fd.get("phone")),
    email: strOrNull(fd.get("email")),
    relation: strOrNull(fd.get("relation")),
    notes: strOrNull(fd.get("notes")),
  };
}

export async function createCustomerContactAction(
  _prevState: CustomerContactFormState,
  fd: FormData,
): Promise<CustomerContactFormState> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);

  const customerId = String(fd.get("customer_id") ?? "").trim();
  if (!customerId) return { error: "缺少 customer_id" };

  const payload = pickPayload(fd);
  const fieldErrors: CustomerContactFormState["fieldErrors"] = {};
  if (!payload.name) fieldErrors.name = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase.from("customer_contacts").insert({
    brand_id: scope.brand_id,
    subsidiary_id: scope.subsidiary_id,
    customer_id: customerId,
    ...payload,
  });
  if (error) return mapDbError(error);

  revalidatePath(`/admin/master-data/customers/${customerId}`);
  revalidatePath("/admin/master-data/customer-contacts");
  redirect(`/admin/master-data/customers/${customerId}`);
}

export async function updateCustomerContactAction(
  _prevState: CustomerContactFormState,
  fd: FormData,
): Promise<CustomerContactFormState> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);

  const id = String(fd.get("id") ?? "").trim();
  const customerId = String(fd.get("customer_id") ?? "").trim();
  if (!id) return { error: "缺少 contact id" };

  const payload = pickPayload(fd);
  const fieldErrors: CustomerContactFormState["fieldErrors"] = {};
  if (!payload.name) fieldErrors.name = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customer_contacts")
    .update({
      ...payload,
      is_active: fd.get("is_active") === "on",
    })
    .eq("id", id);
  if (error) return mapDbError(error);

  if (customerId) {
    revalidatePath(`/admin/master-data/customers/${customerId}`);
  }
  revalidatePath("/admin/master-data/customer-contacts");
  redirect(`/admin/master-data/customers/${customerId}`);
}

// ──────────────────────────────────────────────────────────
// Design Pattern detail page 用的 Result-typed actions（不 redirect，
// client 自控導航 + banner + 樂觀更新）。上面的 form-shape action 保留不動，
// 各客戶詳情頁的舊 modal 還在用。
// ──────────────────────────────────────────────────────────

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CustomerContactInput = {
  customer_id: string;
  role: ContactRole;
  name: string;
  phone: string | null;
  email: string | null;
  relation: string | null;
  notes: string | null;
};

function mapResultError(error: { code?: string; message: string }): string {
  if (error.code === "23503" && error.message.includes("customer_id")) {
    return "客戶不存在或已被刪除";
  }
  return `儲存失敗：${error.message}`;
}

export async function createCustomerContactResultAction(
  input: CustomerContactInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);

  const customerId = input.customer_id?.trim();
  if (!customerId) return { ok: false, error: "請選擇所屬客戶" };
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "姓名必填" };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("customer_contacts")
    .insert({
      brand_id: scope.brand_id,
      subsidiary_id: scope.subsidiary_id,
      customer_id: customerId,
      role: pickRole(input.role),
      name,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      relation: input.relation?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapResultError(error) };

  revalidatePath(`/admin/master-data/customers/${customerId}`);
  revalidatePath("/admin/master-data/customer-contacts");
  return { ok: true, data: { id: data.id } };
}

export async function updateCustomerContactResultAction(
  id: string,
  patch: Partial<Omit<CustomerContactInput, "customer_id">>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!id) return { ok: false, error: "缺少 contact id" };

  const update: Record<string, unknown> = {};
  if (patch.role !== undefined) update.role = pickRole(patch.role);
  if (patch.name !== undefined) {
    const v = patch.name.trim();
    if (!v) return { ok: false, error: "姓名必填" };
    update.name = v;
  }
  if (patch.phone !== undefined) update.phone = patch.phone?.trim() || null;
  if (patch.email !== undefined) update.email = patch.email?.trim() || null;
  if (patch.relation !== undefined)
    update.relation = patch.relation?.trim() || null;
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null;
  update.updated_at = new Date().toISOString();

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("customer_contacts")
    .update(update)
    .eq("brand_id", scope.brand_id)
    .eq("id", id);
  if (error) return { ok: false, error: mapResultError(error) };

  revalidatePath("/admin/master-data/customer-contacts");
  revalidatePath(`/admin/master-data/customer-contacts/${id}`);
  return { ok: true, data: { id } };
}

export async function setCustomerContactActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!id) return { ok: false, error: "缺少 contact id" };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("customer_contacts")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("brand_id", scope.brand_id)
    .eq("id", id);
  if (error) return { ok: false, error: mapResultError(error) };

  revalidatePath("/admin/master-data/customer-contacts");
  revalidatePath(`/admin/master-data/customer-contacts/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteCustomerContactAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!id) return { ok: false, error: "缺少 contact id" };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("customer_contacts")
    .delete()
    .eq("brand_id", scope.brand_id)
    .eq("id", id);
  if (error) return { ok: false, error: mapResultError(error) };

  revalidatePath("/admin/master-data/customer-contacts");
  return { ok: true, data: { id } };
}

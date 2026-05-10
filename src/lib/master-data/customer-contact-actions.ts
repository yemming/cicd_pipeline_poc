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
  const { error } = await supabase.from("customer_contacts").insert({
    brand_id: (await getActiveScope()).brand_id,
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

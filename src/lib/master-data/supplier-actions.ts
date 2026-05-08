"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { SupplierFormState } from "./supplier-form-types";

const SUPPLIER_TYPES = ["oem", "agent", "consumable", "services", "other"] as const;
type SupplierType = (typeof SUPPLIER_TYPES)[number];

function pickType(raw: FormDataEntryValue | null): SupplierType {
  const v = String(raw ?? "agent");
  return (SUPPLIER_TYPES as readonly string[]).includes(v)
    ? (v as SupplierType)
    : "agent";
}

function strOrNull(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  return v.length === 0 ? null : v;
}

function mapDbError(error: { code?: string; message: string }): SupplierFormState {
  if (error.code === "23505" && error.message.includes("suppliers_brand_id_code_key")) {
    return {
      error: "供應商代碼重複",
      fieldErrors: { code: "此代碼已存在，請改一個或留空自動產生" },
    };
  }
  if (error.code === "23503" && error.message.includes("gl_payable_account_id")) {
    return {
      error: "應付帳款科目不存在",
      fieldErrors: { gl_payable_account_id: "請重新選擇科目" },
    };
  }
  return { error: `儲存失敗：${error.message}` };
}

async function genSupplierCode(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("code")
    .eq("brand_id", getBrandKey())
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

function pickPayload(fd: FormData) {
  return {
    name: String(fd.get("name") ?? "").trim(),
    type: pickType(fd.get("type")),
    tax_id: strOrNull(fd.get("tax_id")),
    primary_contact: strOrNull(fd.get("primary_contact")),
    phone: strOrNull(fd.get("phone")),
    email: strOrNull(fd.get("email")),
    address: strOrNull(fd.get("address")),
    payment_terms: strOrNull(fd.get("payment_terms")),
    default_currency: strOrNull(fd.get("default_currency")) ?? "TWD",
    gl_payable_account_id: strOrNull(fd.get("gl_payable_account_id")),
    notes: strOrNull(fd.get("notes")),
  };
}

export async function createSupplierAction(
  _prevState: SupplierFormState,
  fd: FormData,
): Promise<SupplierFormState> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) redirect("/login");

  const payload = pickPayload(fd);
  const codeRaw = String(fd.get("code") ?? "").trim();
  const fieldErrors: SupplierFormState["fieldErrors"] = {};
  if (!payload.name) fieldErrors.name = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
  }

  const code = codeRaw.length > 0 ? codeRaw : await genSupplierCode();

  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert({
    brand_id: getBrandKey(),
    code,
    ...payload,
    created_by: ctx.userId,
  });
  if (error) return mapDbError(error);

  revalidatePath("/admin/master-data/suppliers");
  redirect("/admin/master-data/suppliers");
}

export async function updateSupplierAction(
  _prevState: SupplierFormState,
  fd: FormData,
): Promise<SupplierFormState> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "缺少 supplier id" };

  const payload = pickPayload(fd);
  const code = String(fd.get("code") ?? "").trim();
  const fieldErrors: SupplierFormState["fieldErrors"] = {};
  if (!code) fieldErrors.code = "必填";
  if (!payload.name) fieldErrors.name = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      code,
      ...payload,
      is_active: fd.get("is_active") === "on",
    })
    .eq("id", id);
  if (error) return mapDbError(error);

  revalidatePath("/admin/master-data/suppliers");
  revalidatePath(`/admin/master-data/suppliers/${id}`);
  redirect("/admin/master-data/suppliers");
}

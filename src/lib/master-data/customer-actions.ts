"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { CustomerFormState } from "./customer-form-types";

const CUSTOMER_TYPES = ["individual", "corporate"] as const;
type CustomerType = (typeof CUSTOMER_TYPES)[number];

function pickType(raw: FormDataEntryValue | null): CustomerType {
  const v = String(raw ?? "individual");
  return (CUSTOMER_TYPES as readonly string[]).includes(v)
    ? (v as CustomerType)
    : "individual";
}

function strOrNull(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  return v.length === 0 ? null : v;
}

function dateOrNull(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  return v.length === 0 ? null : v;
}

function mapDbError(error: { code?: string; message: string }): CustomerFormState {
  if (error.code === "23505" && error.message.includes("customers_brand_id_code_key")) {
    return {
      error: "客戶代碼重複",
      fieldErrors: { code: "此客戶代碼已存在，請改一個或留空自動產生" },
    };
  }
  if (error.code === "23503" && error.message.includes("gl_receivable_account_id")) {
    return {
      error: "應收帳款科目不存在",
      fieldErrors: { gl_receivable_account_id: "請重新選擇科目" },
    };
  }
  return { error: `儲存失敗：${error.message}` };
}

/**
 * 自動產生 code — 抓同 brand 內最大的 C\d+ 流水號 + 1，padded 到 5 位。
 * 若沒有任何匹配的舊資料，從 C00001 開始。
 */
async function genCustomerCode(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("code")
    .eq("brand_id", getBrandKey())
    .ilike("code", "C%")
    .order("code", { ascending: false })
    .limit(50);
  if (error || !data) return `C${"00001"}`;
  let max = 0;
  for (const row of data) {
    const m = /^C(\d+)$/.exec(row.code);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `C${String(max + 1).padStart(5, "0")}`;
}

function pickPayload(fd: FormData) {
  return {
    name: String(fd.get("name") ?? "").trim(),
    type: pickType(fd.get("type")),
    tax_id: strOrNull(fd.get("tax_id")),
    phone: strOrNull(fd.get("phone")),
    email: strOrNull(fd.get("email")),
    address: strOrNull(fd.get("address")),
    birthday: dateOrNull(fd.get("birthday")),
    source_module: strOrNull(fd.get("source_module")),
    gl_receivable_account_id: strOrNull(fd.get("gl_receivable_account_id")),
    notes: strOrNull(fd.get("notes")),
  };
}

export async function createCustomerAction(
  _prevState: CustomerFormState,
  fd: FormData,
): Promise<CustomerFormState> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) redirect("/login");

  const payload = pickPayload(fd);
  const codeRaw = String(fd.get("code") ?? "").trim();
  const fieldErrors: CustomerFormState["fieldErrors"] = {};
  if (!payload.name) fieldErrors.name = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
  }

  const code = codeRaw.length > 0 ? codeRaw : await genCustomerCode();

  const supabase = await createClient();
  const { error } = await supabase.from("customers").insert({
    brand_id: getBrandKey(),
    code,
    ...payload,
    created_by: ctx.userId,
  });
  if (error) return mapDbError(error);

  revalidatePath("/admin/master-data/customers");
  redirect("/admin/master-data/customers");
}

export async function updateCustomerAction(
  _prevState: CustomerFormState,
  fd: FormData,
): Promise<CustomerFormState> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "缺少 customer id" };

  const payload = pickPayload(fd);
  const code = String(fd.get("code") ?? "").trim();
  const fieldErrors: CustomerFormState["fieldErrors"] = {};
  if (!code) fieldErrors.code = "必填";
  if (!payload.name) fieldErrors.name = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({
      code,
      ...payload,
      is_active: fd.get("is_active") === "on",
    })
    .eq("id", id);
  if (error) return mapDbError(error);

  revalidatePath("/admin/master-data/customers");
  revalidatePath(`/admin/master-data/customers/${id}`);
  redirect("/admin/master-data/customers");
}

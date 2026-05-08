"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { DepartmentFormState } from "./department-form-types";

function strOrNull(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  return v.length === 0 ? null : v;
}

function mapDbError(error: { code?: string; message: string }): DepartmentFormState {
  if (error.code === "23505" && error.message.includes("departments_brand_id_code_key")) {
    return {
      error: "部門代碼重複",
      fieldErrors: { code: "此代碼已存在，請改一個" },
    };
  }
  if (error.code === "23503") {
    if (error.message.includes("manager_employee_id")) {
      return {
        error: "主管員工不存在",
        fieldErrors: { manager_employee_id: "請重新選擇" },
      };
    }
    if (error.message.includes("parent_id")) {
      return {
        error: "上層部門不存在",
        fieldErrors: { parent_id: "請重新選擇" },
      };
    }
  }
  if (error.code === "23P01" || /23P01/i.test(error.message)) {
    return { error: "上層部門變動會造成循環引用" };
  }
  return { error: `儲存失敗：${error.message}` };
}

function pickPayload(fd: FormData) {
  return {
    code: String(fd.get("code") ?? "").trim(),
    name: String(fd.get("name") ?? "").trim(),
    parent_id: strOrNull(fd.get("parent_id")),
    manager_employee_id: strOrNull(fd.get("manager_employee_id")),
  };
}

export async function createDepartmentAction(
  _prevState: DepartmentFormState,
  fd: FormData,
): Promise<DepartmentFormState> {
  await requirePermission(PERMISSIONS.ORG_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) redirect("/login");

  const payload = pickPayload(fd);
  const fieldErrors: DepartmentFormState["fieldErrors"] = {};
  if (!payload.code) fieldErrors.code = "必填";
  if (!payload.name) fieldErrors.name = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("departments").insert({
    brand_id: getBrandKey(),
    ...payload,
  });
  if (error) return mapDbError(error);

  revalidatePath("/admin/master-data/departments");
  redirect("/admin/master-data/departments");
}

export async function updateDepartmentAction(
  _prevState: DepartmentFormState,
  fd: FormData,
): Promise<DepartmentFormState> {
  await requirePermission(PERMISSIONS.ORG_EDIT);

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "缺少 department id" };

  const payload = pickPayload(fd);
  const fieldErrors: DepartmentFormState["fieldErrors"] = {};
  if (!payload.code) fieldErrors.code = "必填";
  if (!payload.name) fieldErrors.name = "必填";
  if (payload.parent_id === id) fieldErrors.parent_id = "不能設自己當上層";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .update({
      ...payload,
      is_active: fd.get("is_active") === "on",
    })
    .eq("id", id);
  if (error) return mapDbError(error);

  revalidatePath("/admin/master-data/departments");
  revalidatePath(`/admin/master-data/departments/${id}`);
  redirect("/admin/master-data/departments");
}

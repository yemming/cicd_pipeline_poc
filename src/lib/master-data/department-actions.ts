"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { DepartmentFieldKey } from "./department-form-types";

import { getActiveScope } from "@/lib/scope/active-scope";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Partial<Record<DepartmentFieldKey, string>> };

export type DepartmentInput = {
  code: string;
  name: string;
  parent_id?: string | null;
  manager_employee_id?: string | null;
  is_active?: boolean;
};

function trim(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function mapDbError(error: { code?: string; message: string }): {
  error: string;
  fieldErrors?: Partial<Record<DepartmentFieldKey, string>>;
} {
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

function buildPayload(input: DepartmentInput) {
  return {
    code: (input.code ?? "").trim(),
    name: (input.name ?? "").trim(),
    parent_id: trim(input.parent_id ?? null),
    manager_employee_id: trim(input.manager_employee_id ?? null),
  };
}

export async function createDepartmentAction(
  input: DepartmentInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ORG_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };

  const payload = buildPayload(input);
  const fieldErrors: Partial<Record<DepartmentFieldKey, string>> = {};
  if (!payload.code) fieldErrors.code = "必填";
  if (!payload.name) fieldErrors.name = "必填";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("departments")
    .insert({
      brand_id: scope.brand_id,
      subsidiary_id: scope.subsidiary_id,
      ...payload,
    })
    .select("id")
    .single();
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  revalidatePath("/admin/master-data/departments");
  return { ok: true, data: { id: data.id } };
}

export async function updateDepartmentAction(
  id: string,
  input: DepartmentInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ORG_EDIT);
  if (!id) return { ok: false, error: "缺少 department id" };

  const payload = buildPayload(input);
  const fieldErrors: Partial<Record<DepartmentFieldKey, string>> = {};
  if (!payload.code) fieldErrors.code = "必填";
  if (!payload.name) fieldErrors.name = "必填";
  if (payload.parent_id === id) fieldErrors.parent_id = "不能設自己當上層";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .update({
      ...payload,
      ...(input.is_active === undefined ? {} : { is_active: input.is_active }),
    })
    .eq("id", id);
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  revalidatePath("/admin/master-data/departments");
  revalidatePath(`/admin/master-data/departments/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteDepartmentAction(
  id: string,
): Promise<ActionResult<null>> {
  await requirePermission(PERMISSIONS.ORG_EDIT);
  if (!id) return { ok: false, error: "缺少 department id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .delete()
    .eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "此部門被員工或下層部門引用，無法刪除。請改用停用保留歷史。",
      };
    }
    return { ok: false, error: `刪除失敗：${error.message}` };
  }
  revalidatePath("/admin/master-data/departments");
  return { ok: true, data: null };
}

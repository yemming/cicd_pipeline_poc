"use server";

/**
 * Server actions — Aftersales Staff（售後員工名冊）
 *
 * 設計稿：07_售後管理模組_v2.html → Tab A
 * 路由：/parts/aftersales/management/staff
 *
 * - 寫的是 employees 表（typed core），售後特有屬性合併進 metadata jsonb
 * - 權限：reuse master.employee.edit
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission, getCurrentUserContext } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  defaultFinalInspectionAuth,
  isFinalInspectionAuthLocked,
} from "@/domain/aftersales-staff.constants";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/aftersales/management/staff";

export type AftersalesStaffInput = {
  emp_code: string;
  name: string;
  dept_id: string | null;
  position: string | null;
  grade: string | null;
  work_type: string | null;
  final_inspection_auth: boolean;
  system_account: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
};

function trim(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length === 0 ? null : t;
}

function validate(input: AftersalesStaffInput): string | null {
  if (!input.emp_code?.trim()) return "員工編號必填";
  if (!input.name?.trim()) return "姓名必填";
  if (input.email && !/.+@.+\..+/.test(input.email)) return "Email 格式錯誤";
  return null;
}

function mapDbError(error: { code?: string; message: string }): string {
  if (
    error.code === "23505" &&
    error.message.includes("employees_brand_emp_code_unique")
  ) {
    return "此員工編號在當前品牌已存在 — 請改一個";
  }
  if (error.code === "23503") {
    return "外鍵不存在（部門可能已刪除）";
  }
  return `儲存失敗：${error.message}`;
}

function buildMetadata(input: AftersalesStaffInput, base: Record<string, unknown> = {}) {
  const grade = trim(input.grade);
  const work_type = trim(input.work_type);
  const system_account = trim(input.system_account);
  const auth = isFinalInspectionAuthLocked(grade)
    ? true
    : Boolean(input.final_inspection_auth);
  return {
    ...base,
    grade,
    work_type,
    final_inspection_auth: auth,
    system_account,
  };
}

/* ────────────── CRUD ────────────── */

export async function createAftersalesStaffAction(
  input: AftersalesStaffInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.EMPLOYEE_EDIT);
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const ctx = await getCurrentUserContext();
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const grade = trim(input.grade);
  const finalAuth = isFinalInspectionAuthLocked(grade)
    ? true
    : input.final_inspection_auth ?? defaultFinalInspectionAuth(grade);

  const { data, error } = await supabase
    .from("employees")
    .insert({
      brand_id: brand,
      emp_code: input.emp_code.trim(),
      name: input.name.trim(),
      dept_id: input.dept_id || null,
      position: trim(input.position),
      email: trim(input.email),
      phone: trim(input.phone),
      employment_status: input.is_active ? "active" : "terminated",
      is_active: input.is_active,
      notes: trim(input.notes),
      metadata: buildMetadata({ ...input, final_inspection_auth: finalAuth }),
      created_by: ctx.userId ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error) };

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateAftersalesStaffAction(
  id: string,
  patch: Partial<AftersalesStaffInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.EMPLOYEE_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 先撈現況以維持不存在欄位的舊值（特別是 metadata 不可整段覆蓋掉非售後 key）
  const { data: existing, error: existsErr } = await supabase
    .from("employees")
    .select(
      "id, brand_id, emp_code, name, email, phone, dept_id, position, employment_status, is_active, notes, metadata",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existsErr || !existing) return { ok: false, error: "找不到員工或不在當前品牌" };

  const merged: AftersalesStaffInput = {
    emp_code: patch.emp_code ?? (existing.emp_code as string),
    name: patch.name ?? (existing.name as string),
    dept_id: patch.dept_id ?? ((existing.dept_id as string | null) ?? null),
    position: patch.position ?? ((existing.position as string | null) ?? null),
    email: patch.email ?? ((existing.email as string | null) ?? null),
    phone: patch.phone ?? ((existing.phone as string | null) ?? null),
    notes: patch.notes ?? ((existing.notes as string | null) ?? null),
    is_active: patch.is_active ?? Boolean(existing.is_active ?? true),
    grade:
      patch.grade !== undefined
        ? patch.grade
        : ((existing.metadata as Record<string, unknown> | null)?.grade as string | null) ?? null,
    work_type:
      patch.work_type !== undefined
        ? patch.work_type
        : ((existing.metadata as Record<string, unknown> | null)?.work_type as
            | string
            | null) ?? null,
    final_inspection_auth:
      patch.final_inspection_auth !== undefined
        ? patch.final_inspection_auth
        : Boolean(
            (existing.metadata as Record<string, unknown> | null)?.final_inspection_auth,
          ),
    system_account:
      patch.system_account !== undefined
        ? patch.system_account
        : ((existing.metadata as Record<string, unknown> | null)?.system_account as
            | string
            | null) ?? null,
  };

  const verr = validate(merged);
  if (verr) return { ok: false, error: verr };

  const meta = buildMetadata(
    merged,
    (existing.metadata as Record<string, unknown>) ?? {},
  );

  const { error } = await supabase
    .from("employees")
    .update({
      emp_code: merged.emp_code.trim(),
      name: merged.name.trim(),
      dept_id: merged.dept_id || null,
      position: trim(merged.position),
      email: trim(merged.email),
      phone: trim(merged.phone),
      notes: trim(merged.notes),
      is_active: merged.is_active,
      employment_status: merged.is_active
        ? existing.employment_status === "terminated"
          ? "active"
          : (existing.employment_status as string) ?? "active"
        : "terminated",
      metadata: meta,
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id } };
}

export async function setAftersalesStaffActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.EMPLOYEE_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { error } = await supabase
    .from("employees")
    .update({
      is_active: active,
      employment_status: active ? "active" : "terminated",
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `切換狀態失敗：${error.message}` };

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id } };
}

/** 切複檢授權：售後主管鎖定 true，其他職級可切 */
export async function toggleFinalInspectionAuthAction(
  id: string,
  next: boolean,
): Promise<ActionResult<{ id: string; final_inspection_auth: boolean }>> {
  await requirePermission(PERMISSIONS.EMPLOYEE_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: row, error } = await supabase
    .from("employees")
    .select("metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "找不到員工或不在當前品牌" };

  const meta = ((row.metadata as Record<string, unknown> | null) ?? {});
  const grade = (meta.grade as string | null) ?? null;
  if (isFinalInspectionAuthLocked(grade) && next === false) {
    return {
      ok: false,
      error: "售後主管預設擁有竣工複檢授權，無法取消。",
    };
  }
  const newMeta = { ...meta, final_inspection_auth: next };
  const { error: upErr } = await supabase
    .from("employees")
    .update({ metadata: newMeta })
    .eq("id", id)
    .eq("brand_id", brand);
  if (upErr) return { ok: false, error: `儲存失敗：${upErr.message}` };

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id, final_inspection_auth: next } };
}

export async function deleteAftersalesStaffAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.EMPLOYEE_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("employees")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "此員工已被工單 / 派工 / 簽核紀錄引用，無法刪除（請改停用）",
      };
    }
    return { ok: false, error: `刪除失敗：${error.message}` };
  }

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function checkStaffEditPermission(): Promise<boolean> {
  return await hasPermission(PERMISSIONS.EMPLOYEE_EDIT);
}

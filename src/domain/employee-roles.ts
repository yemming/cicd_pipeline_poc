"use server";

/**
 * Domain Helper — 員工角色主檔（employee_role_types）
 *
 * - 集團共用、不分 brand（角色定義抽象、雙 brand 同一份）
 * - is_system=true 的角色：可改顯示屬性（name_zh/color/icon/sort_order），不可改 code、不可 deactivate
 * - 軟刪：is_active=false（不硬刪、避免員工 role_codes 殘留指向不存在的 code）
 * - 天條：UI 永遠走本 helper，不准直連 supabase
 */

import { createClient } from "@/lib/supabase/server";
import type {
  EmployeeRoleType,
  EmployeeRoleInput,
  EmployeeRoleUpdateInput,
  RoleActionResult,
} from "./employee-roles.constants";
import { ROLE_DEFAULT_COLOR, SYSTEM_ROLE_DELETE_MSG } from "./employee-roles.constants";

const SELECT_COLS =
  "code, name_zh, name_en, description, color, icon, sort_order, is_system, is_active, suggested_rbac_role_id, metadata, created_at, updated_at";

function rowToType(r: Record<string, unknown>): EmployeeRoleType {
  return {
    code: r.code as string,
    name_zh: r.name_zh as string,
    name_en: (r.name_en as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    color: (r.color as string) ?? ROLE_DEFAULT_COLOR,
    icon: (r.icon as string | null) ?? null,
    sort_order: Number(r.sort_order ?? 0),
    is_system: Boolean(r.is_system),
    is_active: Boolean(r.is_active),
    suggested_rbac_role_id: (r.suggested_rbac_role_id as string | null) ?? null,
    metadata: (r.metadata as Record<string, unknown> | null) ?? {},
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

export async function listEmployeeRoleTypes(options?: {
  include_inactive?: boolean;
}): Promise<EmployeeRoleType[]> {
  const supabase = await createClient();
  let q = supabase.from("employee_role_types").select(SELECT_COLS);
  if (!options?.include_inactive) q = q.eq("is_active", true);
  const { data, error } = await q.order("sort_order").order("code");
  if (error) throw new Error(`listEmployeeRoleTypes: ${error.message}`);
  return (data ?? []).map((r) => rowToType(r as Record<string, unknown>));
}

export async function getEmployeeRoleType(code: string): Promise<EmployeeRoleType | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_role_types")
    .select(SELECT_COLS)
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(`getEmployeeRoleType: ${error.message}`);
  return data ? rowToType(data as Record<string, unknown>) : null;
}

export async function createEmployeeRoleType(
  input: EmployeeRoleInput,
): Promise<RoleActionResult<{ code: string }>> {
  const code = (input.code ?? "").trim();
  const name_zh = (input.name_zh ?? "").trim();
  if (!code) return { ok: false, error: "角色代碼不可為空" };
  if (!/^[a-z][a-z0-9_]*$/.test(code))
    return { ok: false, error: "角色代碼只允許小寫英文+數字+底線、字母開頭（程式判斷用）" };
  if (!name_zh) return { ok: false, error: "顯示名稱不可為空" };

  const supabase = await createClient();
  const { error } = await supabase.from("employee_role_types").insert({
    code,
    name_zh,
    name_en: input.name_en ?? null,
    description: input.description ?? null,
    color: input.color ?? ROLE_DEFAULT_COLOR,
    icon: input.icon ?? null,
    sort_order: input.sort_order ?? 0,
    is_system: false,
    is_active: true,
    suggested_rbac_role_id: input.suggested_rbac_role_id ?? null,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: `此角色代碼已存在：${code}` };
    return { ok: false, error: `建立角色失敗：${error.message}` };
  }
  return { ok: true, data: { code } };
}

export async function updateEmployeeRoleType(
  code: string,
  patch: EmployeeRoleUpdateInput,
): Promise<RoleActionResult<{ code: string }>> {
  if (!code) return { ok: false, error: "缺角色代碼" };
  const supabase = await createClient();

  // 系統角色不可被 deactivate
  if (patch.is_active === false) {
    const cur = await getEmployeeRoleType(code);
    if (cur?.is_system) return { ok: false, error: SYSTEM_ROLE_DELETE_MSG };

    // 還有員工在用 → 拒絕
    const { count } = await supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .contains("role_codes", [code]);
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error: `仍有 ${count} 名員工掛此角色，請先到員工主檔移除再停用`,
      };
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name_zh !== undefined) update.name_zh = patch.name_zh;
  if (patch.name_en !== undefined) update.name_en = patch.name_en;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.color !== undefined) update.color = patch.color;
  if (patch.icon !== undefined) update.icon = patch.icon;
  if (patch.sort_order !== undefined) update.sort_order = patch.sort_order;
  if (patch.is_active !== undefined) update.is_active = patch.is_active;
  if (patch.suggested_rbac_role_id !== undefined)
    update.suggested_rbac_role_id = patch.suggested_rbac_role_id;

  const { error } = await supabase
    .from("employee_role_types")
    .update(update)
    .eq("code", code);
  if (error) return { ok: false, error: `更新角色失敗：${error.message}` };
  return { ok: true, data: { code } };
}

/** soft delete: is_active=false（is_system/有人用會被擋；硬刪不開放） */
export async function deactivateEmployeeRoleType(
  code: string,
): Promise<RoleActionResult<{ code: string }>> {
  return updateEmployeeRoleType(code, { is_active: false });
}

/** 顯示用：給 chip 渲染（依 code 找 name_zh/color），不在用清單裡的 code 回 null */
export async function resolveRoleDisplay(
  codes: string[],
): Promise<Array<{ code: string; name_zh: string; color: string; missing: boolean }>> {
  if (!codes.length) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_role_types")
    .select("code, name_zh, color, is_active")
    .in("code", codes);
  const map = new Map<string, { name_zh: string; color: string; is_active: boolean }>();
  for (const r of data ?? []) {
    map.set(r.code as string, {
      name_zh: r.name_zh as string,
      color: (r.color as string) ?? ROLE_DEFAULT_COLOR,
      is_active: Boolean(r.is_active),
    });
  }
  return codes.map((c) => {
    const hit = map.get(c);
    return hit
      ? { code: c, name_zh: hit.name_zh, color: hit.color, missing: !hit.is_active }
      : { code: c, name_zh: c, color: ROLE_DEFAULT_COLOR, missing: true };
  });
}

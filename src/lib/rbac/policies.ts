import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { PERMISSIONS, type PermissionCode } from "./permissions";

/**
 * RBAC — DB-driven 版本（NetSuite-style）。
 *
 * 設計：
 *   1. App admin（app_admins 表）→ 自動擁有所有 permission
 *   2. 一般使用者：
 *        - user_assignments 取得其 (role_id × scope) 列表
 *        - role_permissions 取得每個 role 的 permission codes
 *        - 聯集即為其全部權限
 *   3. brand 隔離由 RLS 處理（暫保留舊 user_has_brand-based policy，
 *      最終 cutover 時換成 user_has_permission）；本層只算「有沒有這項權限」。
 *
 * 介面相容性：`hasPermission()` / `requirePermission()` 簽名不變，
 * 全站 600+ call site 不需要動。
 */

const ALL: PermissionCode[] = Object.values(PERMISSIONS);

export const getCurrentUserContext = cache(
  async (): Promise<{
    userId: string | null;
    email: string | null;
    isAdmin: boolean;
    /** 使用者所有 active assignments；scope 等於可作用的範圍 */
    assignments: {
      role_id: string;
      scope_type: "group" | "brand" | "store";
      scope_id: string;
    }[];
  }> => {
    const base = await getCurrentUserAndAdmin();
    if (!base.userId) return { ...base, assignments: [] };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_assignments")
      .select("role_id, scope_type, scope_id, expires_at")
      .eq("user_id", base.userId);

    if (error) {
      console.error("[rbac] load user_assignments failed:", error.message);
      return { ...base, assignments: [] };
    }

    const now = Date.now();
    const active = (data ?? [])
      .filter((a) => !a.expires_at || new Date(a.expires_at).getTime() > now)
      .map((a) => ({
        role_id: a.role_id,
        scope_type: a.scope_type as "group" | "brand" | "store",
        scope_id: a.scope_id,
      }));

    return { ...base, assignments: active };
  },
);

/**
 * 撈使用者全部 permission code（聯集所有 assignment 的 role_permissions）。
 * brand / store 隔離由 RLS 處理；這裡只算「能不能做這件事」。
 */
export const getUserPermissions = cache(async (): Promise<Set<PermissionCode>> => {
  const ctx = await getCurrentUserContext();
  if (ctx.isAdmin) return new Set(ALL);
  if (ctx.assignments.length === 0) return new Set();

  const roleIds = Array.from(new Set(ctx.assignments.map((a) => a.role_id)));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("role_permissions")
    .select("permission_code")
    .in("role_id", roleIds);

  if (error) {
    console.error("[rbac] load role_permissions failed:", error.message);
    return new Set();
  }

  const out = new Set<PermissionCode>();
  for (const row of data ?? []) {
    out.add(row.permission_code as PermissionCode);
  }
  return out;
});

export async function hasPermission(code: PermissionCode): Promise<boolean> {
  const set = await getUserPermissions();
  return set.has(code);
}

export async function requirePermission(code: PermissionCode): Promise<void> {
  if (!(await hasPermission(code))) {
    throw new Error(`權限不足：需要 ${code}`);
  }
}

/**
 * 取得使用者於某 scope 是否擁有特定 permission（細粒度檢查）。
 * 一般 server action 用 hasPermission(code) 即可；此 helper 給之後 admin UI 用。
 */
export async function hasPermissionInScope(
  code: PermissionCode,
  scope: { type: "group" | "brand" | "store"; id: string },
): Promise<boolean> {
  const ctx = await getCurrentUserContext();
  if (ctx.isAdmin) return true;
  if (ctx.assignments.length === 0) return false;

  const roleIdsInScope = ctx.assignments
    .filter((a) => {
      if (a.scope_type === scope.type && a.scope_id === scope.id) return true;
      // group scope 涵蓋 brand / store；brand scope 涵蓋 store。
      // 此處保守：精確比對；之後若需要 scope 繼承，由 SQL function 處理。
      return false;
    })
    .map((a) => a.role_id);

  if (roleIdsInScope.length === 0) return false;

  const supabase = await createClient();
  const { data } = await supabase
    .from("role_permissions")
    .select("permission_code")
    .in("role_id", roleIdsInScope)
    .eq("permission_code", code)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

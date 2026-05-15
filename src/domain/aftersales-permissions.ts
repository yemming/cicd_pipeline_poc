"use server";

/**
 * Domain Helper — Aftersales Permission Matrix（職級權限對照矩陣）
 *
 * 對應頁面：/parts/aftersales/management/permissions
 *
 * 直接吃 RBAC SSOT（roles × permissions × role_permissions）。
 * 不建新表、不複製資料。
 *
 * 矩陣定義：
 *   - 列：AFTERSALES_PERMISSION_GROUPS 內 service.* 的 permission codes（業務分組）
 *   - 欄：AFTERSALES_ROLE_CODES 內 4 個售後相關 role
 *   - cell：role_permissions 是否存在 (role_id, permission_code)
 *
 * 寫入：bulk grant / revoke role_permissions（toggle）。
 */

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { requirePermission, hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import type { Database } from "@/lib/database.types";
import {
  AFTERSALES_MATRIX_CODES,
  AFTERSALES_ROLE_CODES,
  type AftersalesRoleCode,
} from "./aftersales-permissions.constants";

type Tables = Database["public"]["Tables"];
export type RoleRow = Tables["roles"]["Row"];
export type PermissionRow = Tables["permissions"]["Row"];

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const REVALIDATE_PATHS = ["/parts/aftersales/management/permissions"];
function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

// ──────────────────────────────────────────────────────────────────────────
// READ
// ──────────────────────────────────────────────────────────────────────────

export type PermissionMatrixData = {
  /** 售後相關角色（依 AFTERSALES_ROLE_CODES 順序） */
  roles: RoleRow[];
  /** 矩陣涵蓋的 permission rows（含 label / category） */
  permissions: PermissionRow[];
  /** grants[role_id] = Set<permission_code>；只含矩陣涵蓋 codes */
  grants: Record<string, string[]>;
  /** caller 是否能編輯 */
  canEdit: boolean;
};

export async function getAftersalesPermissionMatrix(): Promise<PermissionMatrixData> {
  await requirePermission(PERMISSIONS.AFTERSALES_PERMISSION_VIEW);

  const sb = createServiceClient();
  const [rolesRes, permsRes, grantsRes, canEdit] = await Promise.all([
    sb
      .from("roles")
      .select("*")
      .in("id", AFTERSALES_ROLE_CODES as unknown as string[]),
    sb
      .from("permissions")
      .select("*")
      .in("code", AFTERSALES_MATRIX_CODES as string[]),
    sb
      .from("role_permissions")
      .select("role_id, permission_code")
      .in("role_id", AFTERSALES_ROLE_CODES as unknown as string[])
      .in("permission_code", AFTERSALES_MATRIX_CODES as string[]),
    hasPermission(PERMISSIONS.AFTERSALES_PERMISSION_EDIT),
  ]);

  if (rolesRes.error) throw rolesRes.error;
  if (permsRes.error) throw permsRes.error;
  if (grantsRes.error) throw grantsRes.error;

  // 依 AFTERSALES_ROLE_CODES 與 AFTERSALES_MATRIX_CODES 的順序排序回傳
  const rolesById = new Map((rolesRes.data ?? []).map((r) => [r.id, r]));
  const orderedRoles = AFTERSALES_ROLE_CODES.map((id) => rolesById.get(id)).filter(
    (r): r is RoleRow => Boolean(r),
  );

  const permsByCode = new Map((permsRes.data ?? []).map((p) => [p.code, p]));
  const orderedPerms = AFTERSALES_MATRIX_CODES.map((code) => permsByCode.get(code)).filter(
    (p): p is PermissionRow => Boolean(p),
  );

  const grants: Record<string, string[]> = {};
  for (const row of grantsRes.data ?? []) {
    if (!grants[row.role_id]) grants[row.role_id] = [];
    grants[row.role_id].push(row.permission_code);
  }

  return {
    roles: orderedRoles,
    permissions: orderedPerms,
    grants,
    canEdit,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// WRITE — 批次 grant / revoke
// ──────────────────────────────────────────────────────────────────────────

export type PermissionToggleInput = {
  role_id: AftersalesRoleCode | string;
  permission_code: string;
  granted: boolean;
};

export async function bulkSetAftersalesPermissions(
  updates: PermissionToggleInput[],
): Promise<Result<{ saved: number; granted: number; revoked: number }>> {
  await requirePermission(PERMISSIONS.AFTERSALES_PERMISSION_EDIT);
  if (updates.length === 0) {
    return { ok: true, data: { saved: 0, granted: 0, revoked: 0 } };
  }

  // 防呆：只允許矩陣定義內的 (role, code)
  const allowedRoles = new Set<string>(AFTERSALES_ROLE_CODES as unknown as string[]);
  const allowedCodes = new Set<string>(AFTERSALES_MATRIX_CODES as string[]);
  for (const u of updates) {
    if (!allowedRoles.has(u.role_id)) {
      return { ok: false, error: `不允許修改角色 ${u.role_id}（不在售後職級範圍內）` };
    }
    if (!allowedCodes.has(u.permission_code)) {
      return {
        ok: false,
        error: `不允許修改權限 ${u.permission_code}（不在售後矩陣涵蓋範圍內）`,
      };
    }
  }

  const { userId } = await getCurrentUserAndAdmin();
  void userId; // 目前 role_permissions 沒 audit 欄位；保留以便未來補

  const sb = createServiceClient();
  const toGrant = updates.filter((u) => u.granted);
  const toRevoke = updates.filter((u) => !u.granted);

  if (toGrant.length > 0) {
    const { error } = await sb
      .from("role_permissions")
      .upsert(
        toGrant.map((u) => ({
          role_id: u.role_id,
          permission_code: u.permission_code,
        })),
        { onConflict: "role_id,permission_code", ignoreDuplicates: true },
      );
    if (error) {
      return { ok: false, error: `授予失敗：${error.message}` };
    }
  }

  // revoke：對 system role 不擋（業務需求允許主管調整 owner/manager 的 service.*）
  if (toRevoke.length > 0) {
    // supabase delete 不支援 composite IN，逐個 OR 組起來
    for (const u of toRevoke) {
      const { error } = await sb
        .from("role_permissions")
        .delete()
        .eq("role_id", u.role_id)
        .eq("permission_code", u.permission_code);
      if (error) {
        return { ok: false, error: `撤銷失敗：${error.message}` };
      }
    }
  }

  revalidateAll();
  return {
    ok: true,
    data: {
      saved: updates.length,
      granted: toGrant.length,
      revoked: toRevoke.length,
    },
  };
}

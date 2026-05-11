"use server";

/**
 * Domain Helper — RBAC（roles × permissions × role_permissions）
 *
 * 目標：給 UI 一個正規化 facade 操作 RBAC SSOT，並在「商品管理權限矩陣」案例
 * 把細粒度 capability key 統一翻譯成 RBAC permission code。
 *
 * 對應 plan：/Users/ming/.claude/plans/image-5-image-6-idempotent-rabbit.md
 */

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type PermissionRow = Tables["permissions"]["Row"];
export type RoleRow = Tables["roles"]["Row"];
export type RolePermissionRow = Tables["role_permissions"]["Row"];

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ──────────────────────────────────────────────────────────────────────────
// Item capability ↔ RBAC code 對映表
//   常數已拆到 ./rbac.constants.ts（'use server' 不能 export 非 async value）
// ──────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────
// READ
// ──────────────────────────────────────────────────────────────────────────

export async function listAllPermissions(opts: { module?: string } = {}): Promise<PermissionRow[]> {
  const sb = createServiceClient();
  let q = sb.from("permissions").select("*").order("module").order("category").order("code");
  if (opts.module) q = q.eq("module", opts.module);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PermissionRow[];
}

export async function listAllRoles(): Promise<RoleRow[]> {
  const sb = createServiceClient();
  const { data, error } = await sb.from("roles").select("*").order("id");
  if (error) throw error;
  return (data ?? []) as RoleRow[];
}

/**
 * 撈某些 permission codes 的 role 授予矩陣
 * 回傳 grants[role_id] = Set<permission_code>
 */
export async function getRolePermissionGrants(
  permissionCodes: string[],
): Promise<Record<string, Set<string>>> {
  if (permissionCodes.length === 0) return {};
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("role_permissions")
    .select("role_id, permission_code")
    .in("permission_code", permissionCodes);
  if (error) throw error;

  const grants: Record<string, Set<string>> = {};
  for (const row of data ?? []) {
    const r = row as RolePermissionRow;
    if (!grants[r.role_id]) grants[r.role_id] = new Set();
    grants[r.role_id].add(r.permission_code);
  }
  return grants;
}

// ──────────────────────────────────────────────────────────────────────────
// WRITE
// ──────────────────────────────────────────────────────────────────────────

/**
 * 批次設定多筆 (role_id, permission_code) 的授予狀態
 * granted=true → upsert; granted=false → delete
 *
 * 權限：呼叫者必須有 PARTS_ITEM_PERMISSION_EDIT（這條 helper 目前只給商品管理
 * 權限頁用；未來如果其他模組也要用，把權限 check 拉到呼叫端）
 */
export async function bulkSetRolePermissions(
  updates: Array<{ role_id: string; code: string; granted: boolean }>,
): Promise<Result<{ saved: number }>> {
  await requirePermission(PERMISSIONS.PARTS_ITEM_PERMISSION_EDIT);
  if (updates.length === 0) return { ok: true, data: { saved: 0 } };

  const sb = createServiceClient();

  const toGrant = updates.filter((u) => u.granted);
  const toRevoke = updates.filter((u) => !u.granted);

  if (toGrant.length > 0) {
    const { error } = await sb
      .from("role_permissions")
      .upsert(
        toGrant.map((u) => ({ role_id: u.role_id, permission_code: u.code })),
        { onConflict: "role_id,permission_code" },
      );
    if (error) return { ok: false, error: `upsert role_permissions 失敗：${error.message}` };
  }

  for (const u of toRevoke) {
    const { error } = await sb
      .from("role_permissions")
      .delete()
      .eq("role_id", u.role_id)
      .eq("permission_code", u.code);
    if (error) return { ok: false, error: `delete role_permissions 失敗：${error.message}` };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { saved: updates.length } };
}

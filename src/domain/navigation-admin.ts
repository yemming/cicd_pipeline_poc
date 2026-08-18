/**
 * Navigation / RBAC admin domain helper — server-only。
 *
 * `/admin/navigation/*` 4 個 page + user new/edit page 的 scope options 走這支。
 *
 * 跟 notifications 一樣的 throw sentinel：
 *   - "UNAUTHENTICATED" / "FORBIDDEN_NAV_ADMIN"
 * page 端統一 try/catch。
 */

import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { loadBrandAppearance } from "@/lib/brands/appearance";

import type { NavNodeRow } from "@/app/(workspace)/admin/navigation/_components/nav-editor";

// ───────────────────────── admin guard ─────────────────────────

async function ensureNavAdmin() {
  const ctx = await getCurrentUserAndAdmin();
  if (!ctx.userId) throw new Error("UNAUTHENTICATED");
  if (!ctx.isAdmin) throw new Error("FORBIDDEN_NAV_ADMIN");
  return ctx;
}

// ───────────────────────── Tab 1: 導覽選單 ─────────────────────────

export async function getNavTabData(brandKey: string): Promise<NavNodeRow[]> {
  await ensureNavAdmin();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("nav_nodes")
    .select(
      "id, brand_id, parent_id, level, sort_order, name, icon, emoji, accent, description, module_key, permission, home, page_kind, href, html_storage_path, stitch_screen_id, sprint, is_admin_only, coming_soon, is_active, updated_at",
    )
    .eq("brand_id", brandKey)
    .order("level")
    .order("sort_order");
  if (error) throw new Error(`getNavTabData 失敗：${error.message}`);
  return (data ?? []) as NavNodeRow[];
}

// ───────────────────────── Tab 2: 品牌與模組 ─────────────────────────

export interface BrandTabData {
  appearance: Awaited<ReturnType<typeof loadBrandAppearance>>;
  brands: Array<{ id: string; name: string }>;
  allModules: Array<{ key: string; name: string }>;
  brandModules: Array<{ brand_id: string; module_key: string; enabled: boolean }>;
}

export async function getBrandTabData(brandKey: string): Promise<BrandTabData> {
  await ensureNavAdmin();
  const sb = createServiceClient();
  const [appearance, { data: brandsRows }, { data: modulesRows }, { data: brandModuleRows }] =
    await Promise.all([
      loadBrandAppearance(brandKey),
      sb.from("brands").select("id, name").order("id"),
      sb
        .from("nav_nodes")
        .select("module_key, name, brand_id")
        .eq("level", 1)
        .not("module_key", "is", null),
      sb.from("brand_modules").select("brand_id, module_key, enabled"),
    ]);
  const moduleSet = new Map<string, string>();
  for (const m of modulesRows ?? []) {
    if (m.module_key) moduleSet.set(m.module_key, m.name);
  }
  const allModules = Array.from(moduleSet.entries())
    .map(([key, name]) => ({ key, name }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return {
    appearance,
    brands: brandsRows ?? [],
    allModules,
    brandModules: brandModuleRows ?? [],
  };
}

// ───────────────────────── Tab 3: 角色 ─────────────────────────

export interface RolesTabRow {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  permission_count: number;
  user_count: number;
}

export async function getRolesTabData(): Promise<RolesTabRow[]> {
  await ensureNavAdmin();
  const sb = createServiceClient();
  const [{ data: roles }, { data: rolePerms }, { data: assignments }] = await Promise.all([
    sb.from("roles").select("id, name, description, is_system, created_at").order("id"),
    sb.from("role_permissions").select("role_id"),
    sb.from("user_assignments").select("role_id, user_id"),
  ]);
  const permCount = new Map<string, number>();
  for (const rp of rolePerms ?? []) {
    permCount.set(rp.role_id, (permCount.get(rp.role_id) ?? 0) + 1);
  }
  const usersByRole = new Map<string, Set<string>>();
  for (const ua of assignments ?? []) {
    let set = usersByRole.get(ua.role_id);
    if (!set) {
      set = new Set();
      usersByRole.set(ua.role_id, set);
    }
    set.add(ua.user_id);
  }
  return (roles ?? []).map((r) => ({
    ...r,
    permission_count: permCount.get(r.id) ?? 0,
    user_count: usersByRole.get(r.id)?.size ?? 0,
  }));
}

// ───────────────────────── Tab 4: 權限 ─────────────────────────

export interface PermissionsTabData {
  roles: Array<{ id: string; name: string; description: string | null; is_system: boolean }>;
  permissions: Array<{ code: string; label: string; module: string; category: string | null }>;
  rolePermissions: Array<{ role_id: string; permission_code: string }>;
}

export async function getPermissionsTabData(): Promise<PermissionsTabData> {
  await ensureNavAdmin();
  const sb = createServiceClient();
  const [{ data: roles }, { data: permissions }, { data: rolePerms }] = await Promise.all([
    sb.from("roles").select("id, name, description, is_system").order("id"),
    sb.from("permissions").select("code, label, module, category").order("module").order("code"),
    sb.from("role_permissions").select("role_id, permission_code"),
  ]);
  return {
    roles: roles ?? [],
    permissions: permissions ?? [],
    rolePermissions: rolePerms ?? [],
  };
}

// ───────────────────────── Tab 5: 使用者授權 ─────────────────────────

export interface UserAssignmentRow {
  id: string;
  user_id: string;
  role_id: string;
  scope_type: string;
  scope_id: string;
  granted_at: string;
  expires_at: string | null;
  notes: string | null;
  email: string | null;
}

export interface UserAssignmentsTabData {
  brands: Array<{ id: string; name: string }>;
  roles: Array<{ id: string; name: string; description: string | null }>;
  assignments: UserAssignmentRow[];
  groups: Array<{ id: string; name: string }>;
  stores: Array<{ id: string; name: string; brand_id: string; group_id: string | null }>;
}

export async function getUserAssignmentsTabData(): Promise<UserAssignmentsTabData> {
  await ensureNavAdmin();
  const sb = createServiceClient();
  const [
    { data: brands },
    { data: roles },
    { data: assignments },
    { data: groups },
    { data: stores },
  ] = await Promise.all([
    sb.from("brands").select("id, name").order("id"),
    sb.from("roles").select("id, name, description").order("id"),
    sb
      .from("user_assignments")
      .select("id, user_id, role_id, scope_type, scope_id, granted_at, expires_at, notes")
      .order("granted_at", { ascending: false }),
    sb.from("groups").select("id, name").order("id"),
    sb
      .from("organizations")
      .select("id, name, brand_id, group_id")
      .eq("is_active", true)
      .order("brand_id"),
  ]);

  const userIds = Array.from(new Set((assignments ?? []).map((a) => a.user_id)));
  const userMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
    for (const u of users?.users ?? []) {
      if (u.id && u.email) userMap[u.id] = u.email;
    }
  }
  return {
    brands: brands ?? [],
    roles: roles ?? [],
    assignments: (assignments ?? []).map((a) => ({
      ...a,
      email: userMap[a.user_id] ?? null,
    })),
    groups: groups ?? [],
    stores: stores ?? [],
  };
}

// ───────────────────────── /admin/navigation/roles/[id] ─────────────────────────

export interface RoleDetailRow {
  role: {
    id: string;
    name: string;
    description: string | null;
    is_system: boolean;
    created_at: string;
    updated_at: string;
  };
  grantedPerms: Array<{ code: string; label: string; module: string }>;
  assignmentCount: number;
  recentAssignments: Array<{
    id: string;
    email: string | null;
    user_id: string;
    scope_type: string;
    scope_id: string;
    granted_at: string;
  }>;
}

export async function getRoleDetail(id: string): Promise<RoleDetailRow | null> {
  await ensureNavAdmin();
  const sb = createServiceClient();
  const [{ data: role }, { data: rolePerms }, { data: assignments }, { data: permissions }] =
    await Promise.all([
      sb
        .from("roles")
        .select("id, name, description, is_system, created_at, updated_at")
        .eq("id", id)
        .maybeSingle(),
      sb.from("role_permissions").select("permission_code").eq("role_id", id),
      sb
        .from("user_assignments")
        .select("id, user_id, scope_type, scope_id, granted_at")
        .eq("role_id", id)
        .order("granted_at", { ascending: false })
        .limit(50),
      sb.from("permissions").select("code, label, module"),
    ]);
  if (!role) return null;

  const userIds = Array.from(new Set((assignments ?? []).map((a) => a.user_id)));
  const userMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
    for (const u of users?.users ?? []) {
      if (u.id && u.email) userMap[u.id] = u.email;
    }
  }
  const permMeta = new Map<string, { label: string; module: string }>();
  for (const p of permissions ?? []) {
    permMeta.set(p.code, { label: p.label, module: p.module });
  }
  const grantedPerms = (rolePerms ?? []).map((rp) => ({
    code: rp.permission_code,
    label: permMeta.get(rp.permission_code)?.label ?? rp.permission_code,
    module: permMeta.get(rp.permission_code)?.module ?? "—",
  }));
  return {
    role,
    grantedPerms,
    assignmentCount: assignments?.length ?? 0,
    recentAssignments: (assignments ?? []).slice(0, 10).map((a) => ({
      id: a.id,
      email: userMap[a.user_id] ?? null,
      user_id: a.user_id,
      scope_type: a.scope_type,
      scope_id: a.scope_id,
      granted_at: a.granted_at,
    })),
  };
}

// ───────────────────────── /admin/navigation/users/[userId]/[roleId] ─────────────────────────

export interface AssignmentScopeRow {
  id: string;
  scope_type: string;
  scope_id: string;
  granted_at: string;
  notes: string | null;
}

export interface AssignmentDetailData {
  assignments: AssignmentScopeRow[];
  role: { id: string; name: string; description: string | null } | null;
  email: string | null;
  options: ScopeOptions;
}

export async function getUserAssignmentDetail(
  userId: string,
  roleId: string,
): Promise<AssignmentDetailData> {
  await ensureNavAdmin();
  const sb = createServiceClient();
  const [{ data: assignments }, { data: role }, options] = await Promise.all([
    sb
      .from("user_assignments")
      .select("id, scope_type, scope_id, granted_at, notes")
      .eq("user_id", userId)
      .eq("role_id", roleId)
      .order("granted_at", { ascending: false }),
    sb.from("roles").select("id, name, description").eq("id", roleId).maybeSingle(),
    loadScopeOptionsForAdmin(),
  ]);

  let email: string | null = null;
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
  for (const u of users?.users ?? []) {
    if (u.id === userId && u.email) {
      email = u.email;
      break;
    }
  }
  return {
    assignments: assignments ?? [],
    role,
    email,
    options,
  };
}

// ───────────────────────── Scope options（共用 lookup，被 admin-only board 包著 → 不加 guard） ─────────────────────────

export interface ScopeOptions {
  groups: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  stores: Array<{ id: string; name: string; brand_id: string; group_id: string | null }>;
  roles: Array<{ id: string; name: string; description: string | null }>;
  users: Array<{ id: string; email: string }>;
}

export async function loadScopeOptionsForAdmin(): Promise<ScopeOptions> {
  const sb = createServiceClient();
  const [{ data: groups }, { data: brands }, { data: stores }, { data: roles }, { data: usersRes }] =
    await Promise.all([
      sb.from("groups").select("id, name").order("id"),
      sb.from("brands").select("id, name").order("id"),
      sb
        .from("organizations")
        .select("id, name, brand_id, group_id")
        .eq("is_active", true)
        .order("brand_id")
        .order("name"),
      sb.from("roles").select("id, name, description").order("id"),
      sb.auth.admin.listUsers({ perPage: 200 }),
    ]);
  const users = (usersRes?.users ?? [])
    .filter((u) => !!u.email)
    .map((u) => ({ id: u.id, email: u.email as string }))
    .sort((a, b) => a.email.localeCompare(b.email));
  return {
    groups: groups ?? [],
    brands: brands ?? [],
    stores: stores ?? [],
    roles: roles ?? [],
    users,
  };
}

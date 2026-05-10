import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { createServiceClient } from "@/lib/supabase/service";
import { loadBrandAppearance } from "@/lib/brands/appearance";
import { brands as brandConfigs } from "@/lib/brands/registry";
import { getActiveScope } from "@/lib/scope/active-scope";

import { AdminTabs, type AdminTabKey } from "./_components/admin-tabs";
import { NavEditor, type NavNodeRow } from "./_components/nav-editor";
import { BrandConfigEditor } from "./_components/brand-config-editor";
import { RolesBoard } from "./_components/roles-board";
import { PermissionsBoard } from "./_components/permissions-board";
import { UserAssignmentsBoard } from "./_components/user-assignments-board";

export const dynamic = "force-dynamic";

const VALID_TABS: AdminTabKey[] = ["nav", "brand", "roles", "permissions", "users"];

export default async function NavAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { userId, email, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto pt-12">
        <div className="bg-white rounded-3xl p-12 shadow-sm border border-slate-100 text-center">
          <h1 className="text-2xl font-bold mb-2">無權限</h1>
          <p className="text-sm text-on-surface-variant">
            目前帳號 ({email}) 不在 app_admins 清單內。
          </p>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const tab: AdminTabKey = (VALID_TABS as string[]).includes(sp.tab ?? "")
    ? (sp.tab as AdminTabKey)
    : "nav";

  const brandKey = (await getActiveScope()).brand_id;
  const brand = brandConfigs[brandKey];

  // 各 tab 自己撈自己需要的資料；server component 內部 await 即可
  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">系統後臺</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {brand.displayName}
        </span>
        <span className="text-[12px] text-[#9A9890]">
          管理導覽、品牌、權限、使用者授權
        </span>
      </header>

      <AdminTabs active={tab} />

      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
        {tab === "nav" && <NavTab brandKey={brandKey} brandName={brand.displayName} />}
        {tab === "brand" && <BrandTab brandKey={brandKey} brandName={brand.displayName} />}
        {tab === "roles" && <RolesTab />}
        {tab === "permissions" && <PermissionsTab />}
        {tab === "users" && <UsersTab />}
      </div>
    </main>
  );
}

// ─────────────────────────── Tab 1：導覽選單 ───────────────────────────
async function NavTab({ brandKey, brandName }: { brandKey: string; brandName: string }) {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("nav_nodes")
    .select(
      "id, brand_id, parent_id, level, sort_order, name, icon, emoji, accent, description, module_key, permission, home, page_kind, href, html_storage_path, stitch_screen_id, sprint, is_admin_only, coming_soon, is_active, updated_at",
    )
    .eq("brand_id", brandKey)
    .order("level")
    .order("sort_order");

  if (error) {
    return <div className="text-[#CC0000] text-[12.5px]">載入失敗：{error.message}</div>;
  }
  const rows = (data ?? []) as NavNodeRow[];
  return <NavEditor initialRows={rows} brandKey={brandKey} brandName={brandName} />;
}

// ─────────────────────────── Tab 2：品牌與模組 ───────────────────────────
async function BrandTab({ brandKey, brandName }: { brandKey: string; brandName: string }) {
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

  return (
    <BrandConfigEditor
      brandKey={brandKey}
      brandName={brandName}
      initial={{
        dashboard_tagline: appearance.dashboard_tagline,
        footer_badge_url: appearance.footer_badge_url,
      }}
      brands={brandsRows ?? []}
      allModules={allModules}
      brandModules={brandModuleRows ?? []}
    />
  );
}

// ─────────────────────────── Tab 3：角色（List View） ───────────────────────────
async function RolesTab() {
  const sb = createServiceClient();
  const [{ data: roles }, { data: rolePerms }, { data: assignments }] = await Promise.all([
    sb.from("roles").select("id, name, description, is_system, created_at").order("id"),
    sb.from("role_permissions").select("role_id"),
    // user_id + role_id；後面用 Set 算 distinct user 數
    sb.from("user_assignments").select("role_id, user_id"),
  ]);

  // 每個 role 已授予的 permission 數
  const permCount = new Map<string, number>();
  for (const rp of rolePerms ?? []) {
    permCount.set(rp.role_id, (permCount.get(rp.role_id) ?? 0) + 1);
  }
  // 使用此 role 的 distinct user 數（一個人有多個 scope 也只算一次）
  const usersByRole = new Map<string, Set<string>>();
  for (const ua of assignments ?? []) {
    let set = usersByRole.get(ua.role_id);
    if (!set) {
      set = new Set();
      usersByRole.set(ua.role_id, set);
    }
    set.add(ua.user_id);
  }

  const rows = (roles ?? []).map((r) => ({
    ...r,
    permission_count: permCount.get(r.id) ?? 0,
    user_count: usersByRole.get(r.id)?.size ?? 0,
  }));

  return <RolesBoard rows={rows} />;
}

// ─────────────────────────── Tab 4：權限 ───────────────────────────
async function PermissionsTab() {
  const sb = createServiceClient();
  const [{ data: roles }, { data: permissions }, { data: rolePerms }] = await Promise.all([
    sb.from("roles").select("id, name, description, is_system").order("id"),
    sb.from("permissions").select("code, label, module, category").order("module").order("code"),
    sb.from("role_permissions").select("role_id, permission_code"),
  ]);

  return (
    <PermissionsBoard
      roles={roles ?? []}
      permissions={permissions ?? []}
      rolePermissions={rolePerms ?? []}
    />
  );
}

// ─────────────────────────── Tab 4：使用者授權 ───────────────────────────
async function UsersTab() {
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

  return (
    <UserAssignmentsBoard
      brands={brands ?? []}
      roles={roles ?? []}
      assignments={(assignments ?? []).map((a) => ({
        ...a,
        email: userMap[a.user_id] ?? null,
      }))}
      groups={groups ?? []}
      stores={stores ?? []}
    />
  );
}

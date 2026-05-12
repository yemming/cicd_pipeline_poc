import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { brands as brandConfigs } from "@/lib/brands/registry";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  getNavTabData,
  getBrandTabData,
  getRolesTabData,
  getPermissionsTabData,
  getUserAssignmentsTabData,
} from "@/domain/navigation-admin";

import { AdminTabs, type AdminTabKey } from "./_components/admin-tabs";
import { NavEditor } from "./_components/nav-editor";
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
  // page-level admin guard 仍保留：tab loader 內也會自己 guard，
  // 但 page 頂層先擋一道，可少 render 整個外層殼。
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
  let rows: Awaited<ReturnType<typeof getNavTabData>>;
  try {
    rows = await getNavTabData(brandKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return <div className="text-[#CC0000] text-[12.5px]">載入失敗：{msg}</div>;
  }
  return <NavEditor initialRows={rows} brandKey={brandKey} brandName={brandName} />;
}

// ─────────────────────────── Tab 2：品牌與模組 ───────────────────────────
async function BrandTab({ brandKey, brandName }: { brandKey: string; brandName: string }) {
  const { appearance, brands, allModules, brandModules } = await getBrandTabData(brandKey);
  return (
    <BrandConfigEditor
      brandKey={brandKey}
      brandName={brandName}
      initial={{
        dashboard_tagline: appearance.dashboard_tagline,
        footer_badge_url: appearance.footer_badge_url,
      }}
      brands={brands}
      allModules={allModules}
      brandModules={brandModules}
    />
  );
}

// ─────────────────────────── Tab 3：角色（List View） ───────────────────────────
async function RolesTab() {
  const rows = await getRolesTabData();
  return <RolesBoard rows={rows} />;
}

// ─────────────────────────── Tab 4：權限 ───────────────────────────
async function PermissionsTab() {
  const { roles, permissions, rolePermissions } = await getPermissionsTabData();
  return (
    <PermissionsBoard
      roles={roles}
      permissions={permissions}
      rolePermissions={rolePermissions}
    />
  );
}

// ─────────────────────────── Tab 5：使用者授權 ───────────────────────────
async function UsersTab() {
  const { brands, roles, assignments, groups, stores } = await getUserAssignmentsTabData();
  return (
    <UserAssignmentsBoard
      brands={brands}
      roles={roles}
      assignments={assignments}
      groups={groups}
      stores={stores}
    />
  );
}

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { AdminProvider } from "@/components/admin-context";
import { WorkspaceShell } from "@/components/workspace-shell";
import { NavProvider } from "@/components/nav-provider";
import { AppearanceProvider } from "@/components/appearance-context";
import { loadNavTree } from "@/lib/nav/loader";
import { filterNavByPermission } from "@/lib/nav/filter-by-permission";
import { getUserPermissions } from "@/lib/rbac/policies";
import {
  loadBrandAppearance,
  loadUserAppearanceOverride,
  mergeUserAppearance,
} from "@/lib/brands/appearance";
import {
  getActiveScope,
  getAccessibleScopes,
} from "@/lib/scope/active-scope";
import { ScopeProvider } from "@/lib/scope/scope-context";
import { createClient } from "@/lib/supabase/server";

// 確保 brand_appearance 改了之後 reload workspace 一定吃到新值，不被 Next 16 的 layout cache 卡住
export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  const scope = await getActiveScope();
  const accessible = await getAccessibleScopes();
  const [rawModules, brandAppearance, userOverride, perms] = await Promise.all([
    loadNavTree(scope.brand_id),
    loadBrandAppearance(scope.brand_id),
    userId ? loadUserAppearanceOverride(userId) : Promise.resolve(null),
    getUserPermissions(),
  ]);
  // 依使用者權限把沒權限的頁/模組從側欄濾掉（鏡射 page 端 hasPermission / isAdmin guard）
  const modules = filterNavByPermission(rawModules, perms, isAdmin);
  const appearance = mergeUserAppearance(brandAppearance, userOverride);

  const accessibleStores = (accessible.storesByBrand[scope.brand_id] ?? []).map(
    (s) => ({ id: s.id, name: s.name, short_name: s.short_name }),
  );

  // 撈當前法人 short_name 給 Topbar chip 顯示（B5）
  const supabaseClient = await createClient();
  const { data: subRow } = await supabaseClient
    .from("subsidiaries")
    .select("short_name, legal_name")
    .eq("id", scope.subsidiary_id)
    .maybeSingle();
  const subsidiary_short_name =
    subRow?.short_name ?? subRow?.legal_name ?? null;

  return (
    <AdminProvider isAdmin={isAdmin}>
      <ScopeProvider
        value={{
          brand_id: scope.brand_id,
          subsidiary_id: scope.subsidiary_id,
          subsidiary_short_name,
          store_id: scope.store_id,
          accessibleBrands: accessible.brands,
          accessibleStores,
        }}
      >
        <NavProvider modules={modules}>
          <AppearanceProvider
            dashboardTagline={appearance.dashboard_tagline}
            footerBadgeUrl={appearance.footer_badge_url}
            sidebarThemeKey={appearance.sidebar_theme}
            brandPaletteKey={appearance.brand_palette}
            customPalette={appearance.custom_palette}
            shellLayoutKey={appearance.shell_layout}
            shellOptions={appearance.shell_options}
          >
            <WorkspaceShell>{children}</WorkspaceShell>
          </AppearanceProvider>
        </NavProvider>
      </ScopeProvider>
    </AdminProvider>
  );
}

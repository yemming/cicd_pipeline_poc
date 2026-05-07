import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { AdminProvider } from "@/components/admin-context";
import { WorkspaceShell } from "@/components/workspace-shell";
import { NavProvider } from "@/components/nav-provider";
import { AppearanceProvider } from "@/components/appearance-context";
import { loadNavTree } from "@/lib/nav/loader";
import { loadBrandAppearance } from "@/lib/brands/appearance";
import { getBrandKey } from "@/lib/brands/current";

// 確保 brand_appearance 改了之後 reload workspace 一定吃到新值，不被 Next 16 的 layout cache 卡住
export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const brandKey = getBrandKey();
  const { isAdmin } = await getCurrentUserAndAdmin();
  const [modules, appearance] = await Promise.all([
    loadNavTree(brandKey),
    loadBrandAppearance(brandKey),
  ]);
  return (
    <AdminProvider isAdmin={isAdmin}>
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
    </AdminProvider>
  );
}

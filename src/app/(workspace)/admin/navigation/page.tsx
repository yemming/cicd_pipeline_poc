import { redirect } from "next/navigation";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { createServiceClient } from "@/lib/supabase/service";
import { getBrandKey, getCurrentBrand } from "@/lib/brands/current";
import { loadBrandAppearance } from "@/lib/brands/appearance";
import { NavEditor, type NavNodeRow } from "./_components/nav-editor";
import { AppearanceEditor } from "./_components/appearance-editor";

export const dynamic = "force-dynamic";

export default async function NavAdminPage() {
  const { userId, email, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto pt-12">
        <div className="bg-white rounded-3xl p-12 shadow-sm border border-slate-100 text-center">
          <h1 className="text-2xl font-bold mb-2">無權限</h1>
          <p className="text-sm text-on-surface-variant">
            目前帳號 ({email}) 不在 FEEDBACK_ADMIN_EMAILS 清單內。
          </p>
        </div>
      </div>
    );
  }

  const brandKey = getBrandKey();
  const brand = getCurrentBrand();

  const supabase = createServiceClient();
  const [{ data, error }, appearance] = await Promise.all([
    supabase
      .from("nav_nodes")
      .select(
        "id, brand_id, parent_id, level, sort_order, name, icon, accent, description, module_key, permission, home, page_kind, href, html_storage_path, stitch_screen_id, sprint, device, is_admin_only, coming_soon, is_active, updated_at",
      )
      .eq("brand_id", brandKey)
      .order("level")
      .order("sort_order"),
    loadBrandAppearance(brandKey),
  ]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto pt-12">
        <div className="bg-white rounded-3xl p-12 shadow-sm border border-slate-100 text-center">
          <h1 className="text-2xl font-bold mb-2 text-error">載入失敗</h1>
          <p className="text-sm text-on-surface-variant">{error.message}</p>
        </div>
      </div>
    );
  }

  const rows = (data ?? []) as NavNodeRow[];

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      <AppearanceEditor
        brandKey={brandKey}
        brandName={brand.displayName}
        initial={{
          dashboard_tagline: appearance.dashboard_tagline,
          footer_badge_url: appearance.footer_badge_url,
          sidebar_theme: appearance.sidebar_theme,
          brand_palette: appearance.brand_palette,
          custom_palette: appearance.custom_palette,
          shell_layout: appearance.shell_layout,
        }}
      />
      <NavEditor initialRows={rows} brandKey={brandKey} brandName={brand.displayName} />
    </div>
  );
}

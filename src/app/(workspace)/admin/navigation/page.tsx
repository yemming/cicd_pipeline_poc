import { redirect } from "next/navigation";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { createServiceClient } from "@/lib/supabase/service";
import { getBrandKey, getCurrentBrand } from "@/lib/brands/current";
import { NavEditor, type NavNodeRow } from "./_components/nav-editor";

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
  const { data, error } = await supabase
    .from("nav_nodes")
    .select(
      "id, brand_id, parent_id, level, sort_order, name, icon, accent, description, module_key, permission, home, page_kind, href, html_storage_path, stitch_screen_id, sprint, device, is_admin_only, coming_soon, is_active, updated_at",
    )
    .eq("brand_id", brandKey)
    .order("level")
    .order("sort_order");

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

  return <NavEditor initialRows={rows} brandKey={brandKey} brandName={brand.displayName} />;
}

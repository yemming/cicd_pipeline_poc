import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { ItemsBoard, type ItemRow, type SupplierOption } from "./_components/items-board";

export const dynamic = "force-dynamic";

async function loadData() {
  const supabase = await createClient();
  const brand = getBrandKey();
  const [iRes, sRes] = await Promise.all([
    supabase
      .from("items")
      .select(
        "id, code, name, category, control_type, base_uom, standard_cost, suggested_price, warranty_months, shelf_life_months, default_supplier_id, is_active",
      )
      .eq("brand_id", brand)
      .order("code")
      .limit(200),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
  ]);
  if (iRes.error) throw new Error(`items: ${iRes.error.message}`);
  if (sRes.error) throw new Error(`suppliers: ${sRes.error.message}`);
  return {
    rows: (iRes.data ?? []) as unknown as ItemRow[],
    suppliers: (sRes.data ?? []) as unknown as SupplierOption[],
  };
}

export default async function ItemsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視商品基礎資料的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.ITEM_EDIT);
  const { rows, suppliers } = await loadData();
  return <ItemsBoard rows={rows} suppliers={suppliers} canEdit={canEdit} />;
}

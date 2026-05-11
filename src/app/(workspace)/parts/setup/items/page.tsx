import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { ItemsBoard, type ItemRow, type SupplierOption } from "./_components/items-board";

import { getActiveScope } from "@/lib/scope/active-scope";
import { listDictionaries } from "@/domain/dictionaries";
export const dynamic = "force-dynamic";

export type ItemFilters = {
  category: string;
  control: string;
  status: string;
  q: string;
};

async function loadData(filters: ItemFilters) {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("items")
    .select(
      "id, code, name, spec_description, category, control_type, base_uom, standard_cost, suggested_price, warranty_months, shelf_life_months, default_supplier_id, serial_tracking_required, batch_tracking_required, image_url, is_active",
    )
    .eq("brand_id", brand);

  if (filters.category && filters.category !== "all") q = q.eq("category", filters.category);
  if (filters.control && filters.control !== "all") q = q.eq("control_type", filters.control);
  if (filters.status === "active") q = q.eq("is_active", true);
  if (filters.status === "inactive") q = q.eq("is_active", false);
  if (filters.q.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(`code.ilike.%${t}%,name.ilike.%${t}%`);
  }

  const [iRes, sRes, compatRes, totalRes, dictRows] = await Promise.all([
    q.order("code").limit(500),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("item_vehicle_compatibility")
      .select("item_id")
      .eq("brand_id", brand),
    supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand),
    listDictionaries(),
  ]);

  if (iRes.error) throw new Error(`items: ${iRes.error.message}`);
  if (sRes.error) throw new Error(`suppliers: ${sRes.error.message}`);
  if (compatRes.error) throw new Error(`compat: ${compatRes.error.message}`);

  const fitMap = new Map<string, number>();
  for (const c of compatRes.data ?? []) {
    fitMap.set(c.item_id as string, (fitMap.get(c.item_id as string) ?? 0) + 1);
  }
  const rows: ItemRow[] = ((iRes.data ?? []) as unknown as ItemRow[]).map((r) => ({
    ...r,
    fit_count: fitMap.get(r.id) ?? 0,
  }));

  const activeDict = dictRows.filter((d) => d.is_active);
  const categories = activeDict.filter((d) => d.kind === "category").map((d) => d.code);
  const uoms = activeDict.filter((d) => d.kind === "uom").map((d) => d.code);
  const controlLevels = activeDict
    .filter((d) => d.kind === "control_level")
    .map((d) => ({ code: d.code, label: d.label, accent: d.accent_color }));

  return {
    rows,
    suppliers: (sRes.data ?? []) as unknown as SupplierOption[],
    totalCount: totalRes.count ?? 0,
    categories,
    uoms,
    controlLevels,
  };
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
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
  const sp = await searchParams;
  const filters: ItemFilters = {
    category: sp.category ?? "all",
    control: sp.control ?? "all",
    status: sp.status ?? "all",
    q: sp.q ?? "",
  };
  const autoOpenCreate = sp.new === "1";
  const { rows, suppliers, totalCount, categories, uoms, controlLevels } = await loadData(filters);
  return (
    <ItemsBoard
      rows={rows}
      suppliers={suppliers}
      canEdit={canEdit}
      totalCount={totalCount}
      categories={categories}
      uoms={uoms}
      controlLevels={controlLevels}
      filters={filters}
      autoOpenCreate={autoOpenCreate}
    />
  );
}

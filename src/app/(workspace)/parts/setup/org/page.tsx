import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { OrgBoard } from "./_components/org-board";

export const dynamic = "force-dynamic";

type RegionRow = {
  id: string;
  code: string;
  name: string;
  notes: string | null;
  is_active: boolean;
};

type StoreRow = {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  address: string | null;
  phone: string | null;
  parent_id: string | null;
  store_type: string | null;
  is_active: boolean;
};

type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  org_id: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  bin_count: number;
};

async function getOrgData(): Promise<{
  regions: RegionRow[];
  stores: StoreRow[];
  warehouses: WarehouseRow[];
}> {
  const supabase = await createClient();
  const brand = getBrandKey();

  const [regionsRes, storesRes, warehousesRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, code, name, notes, is_active")
      .eq("brand_id", brand)
      .eq("type", "region")
      .order("code"),
    supabase
      .from("organizations")
      .select("id, code, name, short_name, address, phone, parent_id, store_type, is_active")
      .eq("brand_id", brand)
      .eq("type", "store")
      .order("code"),
    supabase
      .from("warehouses")
      .select("id, code, name, type, org_id, address, notes, is_active")
      .eq("brand_id", brand)
      .order("code"),
  ]);

  if (regionsRes.error) throw new Error(`regions: ${regionsRes.error.message}`);
  if (storesRes.error) throw new Error(`stores: ${storesRes.error.message}`);
  if (warehousesRes.error) throw new Error(`warehouses: ${warehousesRes.error.message}`);

  // 改用 head:true count，避免把整張 warehouse_bins 全撈回 Node。
  // 每個 warehouse 一個 count query 平行跑；傳輸量從「N 列 bin」降到「N 個數字」。
  const warehouseRows = warehousesRes.data ?? [];
  const binCountEntries = await Promise.all(
    warehouseRows.map(async (w) => {
      const { count, error } = await supabase
        .from("warehouse_bins")
        .select("*", { count: "exact", head: true })
        .eq("brand_id", brand)
        .eq("warehouse_id", w.id);
      if (error) throw new Error(`bin_count[${w.code}]: ${error.message}`);
      return [w.id, count ?? 0] as const;
    }),
  );
  const binCountByWarehouse = new Map(binCountEntries);

  const warehouses: WarehouseRow[] = warehouseRows.map((w) => ({
    ...w,
    bin_count: binCountByWarehouse.get(w.id) ?? 0,
  }));

  return {
    regions: regionsRes.data ?? [],
    stores: storesRes.data ?? [],
    warehouses,
  };
}

export default async function OrgSetupPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ORG_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視組織架構的權限</p>
      </main>
    );
  }

  const canEditOrg = await hasPermission(PERMISSIONS.ORG_EDIT);
  const canEditWarehouse = await hasPermission(PERMISSIONS.WAREHOUSE_EDIT);
  const { regions, stores, warehouses } = await getOrgData();

  return (
    <OrgBoard
      regions={regions}
      stores={stores}
      warehouses={warehouses}
      canEditOrg={canEditOrg}
      canEditWarehouse={canEditWarehouse}
    />
  );
}

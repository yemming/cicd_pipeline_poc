import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getStagingWarehouseAdminPageData } from "@/domain/parts-warranty-staging";
import { StagingWarehouseBoard } from "./_components/staging-warehouse-board";

export const dynamic = "force-dynamic";

export default async function StagingWarehousePage({
  searchParams,
}: {
  searchParams?: Promise<{ wh?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  // 檢視權限：保固模組 view（看資料）
  if (!(await hasPermission(PERMISSIONS.WARRANTY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視暫存倉設定的權限</p>
      </main>
    );
  }

  const sp = (await searchParams) ?? {};

  // 編輯權限：倉庫設定 edit（切 is_warranty_staging flag）
  const canEdit = await hasPermission(PERMISSIONS.WAREHOUSE_EDIT);

  const data = await getStagingWarehouseAdminPageData(sp.wh);

  return (
    <StagingWarehouseBoard
      tree={data.tree}
      warehouses={data.warehouses}
      stagingWarehouses={data.stagingWarehouses}
      selectedWarehouse={data.selectedWarehouse}
      occupancy={data.occupancy}
      totals={data.totals}
      canEdit={canEdit}
    />
  );
}

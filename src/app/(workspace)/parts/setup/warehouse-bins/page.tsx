import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getWarehouseBinsPageData } from "@/domain/warehouse";

import { WarehouseBinsBoard } from "./_components/warehouse-bins-board";

export const dynamic = "force-dynamic";

export default async function WarehouseBinsPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PARTS_WAREHOUSE_ARCH_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視倉庫設定的權限</p>
      </main>
    );
  }

  const { w } = await searchParams;
  const { warehouses, activeWarehouse, zones } = await getWarehouseBinsPageData(w);
  const canEdit = await hasPermission(PERMISSIONS.PARTS_WAREHOUSE_ARCH_EDIT);

  return (
    <WarehouseBinsBoard
      warehouses={warehouses}
      activeWarehouse={activeWarehouse}
      zones={zones}
      canEdit={canEdit}
    />
  );
}

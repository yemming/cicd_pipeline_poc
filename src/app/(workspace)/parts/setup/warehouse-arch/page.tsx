import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getWarehouseArchPageData } from "@/domain/warehouse";

import { WarehouseArchBoard } from "./_components/warehouse-arch-board";

export const dynamic = "force-dynamic";

export default async function WarehouseArchPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PARTS_WAREHOUSE_ARCH_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視倉儲四層架構的權限</p>
      </main>
    );
  }

  const { layers, warehouses } = await getWarehouseArchPageData();
  return <WarehouseArchBoard layers={layers} warehouses={warehouses} />;
}

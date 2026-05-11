import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  listRegions,
  listStores,
  listWarehouses,
  listSubsidiaryOptions,
} from "@/domain/org";
import { getBinCountsByWarehouseId } from "@/domain/warehouse";

import { OrgBoard } from "./_components/org-board";

export const dynamic = "force-dynamic";

export default async function OrgUnifiedPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ORG_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視組織的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.ORG_EDIT);

  const [regionsRes, storesRes, warehousesRes, subsidiariesRes, binCounts] = await Promise.all([
    listRegions(),
    listStores(),
    listWarehouses(),
    listSubsidiaryOptions(),
    getBinCountsByWarehouseId(),
  ]);

  return (
    <OrgBoard
      regions={regionsRes.data}
      stores={storesRes.data}
      warehouses={warehousesRes.data}
      subsidiaries={subsidiariesRes.data}
      binCountsByWarehouseId={binCounts}
      canEdit={canEdit}
    />
  );
}

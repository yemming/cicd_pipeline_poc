import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  getStagingWarehousePageData,
  listOrganizationsForStaging,
} from "@/domain/warranty";
import { StagingWarehouseBoard } from "./_components/staging-warehouse-board";

export const dynamic = "force-dynamic";

export default async function StagingWarehousePage({
  searchParams,
}: {
  searchParams?: Promise<{ wh?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WARRANTY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視暫存倉設定的權限</p>
      </main>
    );
  }
  const sp = (await searchParams) ?? {};
  const [{ warehouses, rules, activeWarehouse, items, canEdit }, orgs] =
    await Promise.all([
      getStagingWarehousePageData(sp.wh),
      listOrganizationsForStaging(),
    ]);
  return (
    <StagingWarehouseBoard
      warehouses={warehouses}
      rules={rules}
      activeWarehouse={activeWarehouse}
      items={items}
      orgs={orgs}
      canEdit={canEdit}
    />
  );
}

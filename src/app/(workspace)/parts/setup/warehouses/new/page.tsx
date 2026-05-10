import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { listStoreOptions } from "@/domain/org";
import { WarehouseDetailView } from "../[id]/_components/warehouse-detail-view";

export const dynamic = "force-dynamic";

export default async function NewWarehousePage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WAREHOUSE_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有編輯倉庫的權限</p>
      </main>
    );
  }
  const { data: stores } = await listStoreOptions();
  return <WarehouseDetailView warehouse={null} stores={stores} canEdit={true} initialMode="create" />;
}

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getVehicleModelNewPageData } from "@/domain/vehicle-models";

import { VehicleModelDetailView } from "../[id]/_components/vehicle-model-detail-view";

export const dynamic = "force-dynamic";

export default async function VehicleModelNewPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.VEHICLE_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有新增車型的權限</p>
      </main>
    );
  }

  const { accountOptions, taxCodeOptions, seriesOptions } =
    await getVehicleModelNewPageData();

  return (
    <VehicleModelDetailView
      model={null}
      glAccounts={{ inventory: null, cogs: null, revenue: null }}
      taxCode={null}
      accountOptions={accountOptions}
      taxCodeOptions={taxCodeOptions}
      seriesOptions={seriesOptions}
      initialMode="create"
      canEdit={true}
    />
  );
}

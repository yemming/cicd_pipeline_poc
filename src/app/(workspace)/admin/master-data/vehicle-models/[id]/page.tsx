import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getVehicleModelDetailPageData,
  listVehicleModelSeries,
} from "@/domain/vehicle-models";

import { VehicleModelDetailView } from "./_components/vehicle-model-detail-view";

export const dynamic = "force-dynamic";

export default async function VehicleModelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.VEHICLE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視車型主檔的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const [data, seriesOptions, canEdit] = await Promise.all([
    getVehicleModelDetailPageData(id),
    listVehicleModelSeries(),
    hasPermission(PERMISSIONS.VEHICLE_EDIT),
  ]);
  if (!data) notFound();

  return (
    <VehicleModelDetailView
      model={data.model}
      glAccounts={data.glAccounts}
      taxCode={data.taxCode}
      accountOptions={data.accountOptions}
      taxCodeOptions={data.taxCodeOptions}
      seriesOptions={seriesOptions}
      initialMode="view"
      canEdit={canEdit}
    />
  );
}

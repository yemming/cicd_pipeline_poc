import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listVehicleModels,
  listVehicleModelSeries,
} from "@/domain/vehicle-models";
import { VEHICLE_MODEL_PAGE_SIZE_DEFAULT } from "@/domain/vehicle-models.constants";

import { VehicleModelsBoard } from "./_components/vehicle-models-board";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  series?: string;
  status?: string;
  page?: string;
}>;

export default async function VehicleModelsPage({
  searchParams,
}: {
  searchParams: SearchParams;
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

  const sp = await searchParams;
  const filters = {
    q: sp.q ?? "",
    series: sp.series ?? "all",
    status: (sp.status ?? "all") as "all" | "active" | "inactive",
  };
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const pageSize = VEHICLE_MODEL_PAGE_SIZE_DEFAULT;

  const [{ rows, totalCount }, seriesOptions, canEdit] = await Promise.all([
    listVehicleModels(filters, { page, pageSize }),
    listVehicleModelSeries(),
    hasPermission(PERMISSIONS.VEHICLE_EDIT),
  ]);

  return (
    <VehicleModelsBoard
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      seriesOptions={seriesOptions}
      filters={filters}
      canEdit={canEdit}
    />
  );
}

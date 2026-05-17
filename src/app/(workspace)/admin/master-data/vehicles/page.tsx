import { redirect } from "next/navigation";

import {
  listCustomers,
  listCustomerVehicles,
  listVehicleModels,
  VEHICLES_PAGE_SIZE_DEFAULT,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { VehiclesBoard } from "./_components/vehicles-board";

export const dynamic = "force-dynamic";

export default async function VehiclesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.VEHICLE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視車輛的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = VEHICLES_PAGE_SIZE_DEFAULT;

  const canEdit = await hasPermission(PERMISSIONS.VEHICLE_EDIT);
  const [vehiclesResult, customers, models] = await Promise.all([
    listCustomerVehicles({ activeOnly: false, page, pageSize }),
    listCustomers({ limit: 500 }),
    listVehicleModels(),
  ]);

  return (
    <VehiclesBoard
      rows={vehiclesResult.rows}
      totalCount={vehiclesResult.totalCount}
      page={page}
      pageSize={pageSize}
      canEdit={canEdit}
      customers={customers.map((c) => ({ id: c.id, name: c.name }))}
      models={models.map((m) => ({ id: m.id, display_name: m.display_name }))}
    />
  );
}

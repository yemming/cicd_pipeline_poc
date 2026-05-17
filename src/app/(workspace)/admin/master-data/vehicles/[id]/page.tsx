import { notFound, redirect } from "next/navigation";

import {
  getCustomerById,
  getCustomerVehicleById,
  listCustomers,
  listEmployees,
  listVehicleModels,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { VehicleDetailView } from "./_components/vehicle-detail-view";

export const dynamic = "force-dynamic";

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.VEHICLE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視車輛的權限</p>
      </main>
    );
  }

  const [vehicle, customers, models, technicians] = await Promise.all([
    getCustomerVehicleById(id),
    listCustomers({ limit: 500 }),
    listVehicleModels(),
    listEmployees({ status: "active", limit: 200 }),
  ]);
  if (!vehicle) notFound();

  // 確保現任車主在 dropdown — listCustomers 預設只回 is_active；補上以防萬一
  const owner = await getCustomerById(vehicle.customer_id);
  if (owner && !customers.find((c) => c.id === owner.id)) {
    customers.unshift(owner);
  }

  const canEdit = await hasPermission(PERMISSIONS.VEHICLE_EDIT);

  return (
    <VehicleDetailView
      vehicle={vehicle}
      customers={customers}
      models={models}
      technicians={technicians}
      canEdit={canEdit}
    />
  );
}

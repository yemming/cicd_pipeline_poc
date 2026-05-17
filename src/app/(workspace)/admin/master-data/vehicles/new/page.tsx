import { redirect } from "next/navigation";

import {
  listCustomers,
  listEmployees,
  listVehicleModels,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { VehicleDetailView } from "../[id]/_components/vehicle-detail-view";

export const dynamic = "force-dynamic";

export default async function NewVehiclePage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.VEHICLE_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立車輛的權限</p>
      </main>
    );
  }

  const [customers, models, technicians] = await Promise.all([
    listCustomers({ limit: 500 }),
    listVehicleModels(),
    listEmployees({ status: "active", limit: 200 }),
  ]);

  return (
    <VehicleDetailView
      vehicle={null}
      customers={customers}
      models={models}
      technicians={technicians}
      canEdit
      initialMode="create"
    />
  );
}

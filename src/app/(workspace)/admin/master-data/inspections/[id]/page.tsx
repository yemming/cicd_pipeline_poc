import { notFound, redirect } from "next/navigation";

import {
  getCustomerVehicleById,
  getInspectionRecordById,
  listCustomerVehicles,
  listEmployees,
  listInspectionFindings,
  listServiceAppointments,
  listWorkOrders,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { InspectionDetailView } from "./_components/inspection-detail-view";

export const dynamic = "force-dynamic";

export default async function EditInspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.INSPECTION_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視檢驗紀錄的權限</p>
      </main>
    );
  }

  const [
    inspection,
    vehicles,
    workOrders,
    appointments,
    employees,
  ] = await Promise.all([
    getInspectionRecordById(id),
    listCustomerVehicles({ activeOnly: true, limit: 500 }),
    listWorkOrders({ limit: 200 }),
    listServiceAppointments({ limit: 200 }),
    listEmployees({ status: "active", limit: 200 }),
  ]);
  if (!inspection) notFound();

  const findings = await listInspectionFindings(inspection.id);

  // 確保現任車輛在 dropdown
  const vehicle = await getCustomerVehicleById(inspection.vehicle_id);
  if (vehicle && !vehicles.find((v) => v.id === vehicle.id)) {
    vehicles.unshift(vehicle);
  }

  const canEdit = await hasPermission(PERMISSIONS.INSPECTION_EDIT);

  return (
    <InspectionDetailView
      inspection={inspection}
      findings={findings}
      vehicles={vehicles}
      workOrders={workOrders}
      appointments={appointments}
      employees={employees}
      canEdit={canEdit}
    />
  );
}

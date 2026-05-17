import { redirect } from "next/navigation";

import {
  listCustomerVehicles,
  listEmployees,
  listServiceAppointments,
  listWorkOrders,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { InspectionDetailView } from "../[id]/_components/inspection-detail-view";

export const dynamic = "force-dynamic";

export default async function NewInspectionPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.INSPECTION_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立檢驗紀錄的權限</p>
      </main>
    );
  }

  const [vehicles, workOrders, appointments, employees] = await Promise.all([
    listCustomerVehicles({ activeOnly: true, limit: 500 }),
    listWorkOrders({ limit: 200 }),
    listServiceAppointments({ limit: 200 }),
    listEmployees({ status: "active", limit: 200 }),
  ]);

  return (
    <InspectionDetailView
      inspection={null}
      findings={[]}
      vehicles={vehicles}
      workOrders={workOrders}
      appointments={appointments}
      employees={employees}
      canEdit
      initialMode="create"
    />
  );
}

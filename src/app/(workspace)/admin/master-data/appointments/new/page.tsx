import { redirect } from "next/navigation";

import {
  listCustomers,
  listCustomerVehicles,
  listEmployees,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { AppointmentDetailView } from "../[id]/_components/appointment-detail-view";

export const dynamic = "force-dynamic";

export default async function NewAppointmentPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.APPOINTMENT_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立預約的權限</p>
      </main>
    );
  }

  const [customers, vehicles, advisors] = await Promise.all([
    listCustomers({ limit: 500 }),
    listCustomerVehicles({ activeOnly: true, limit: 500 }),
    listEmployees({ status: "active", limit: 200 }),
  ]);

  const canCreateRO = await hasPermission(PERMISSIONS.RO_CREATE);

  return (
    <AppointmentDetailView
      appointment={null}
      customers={customers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        phone: c.phone,
      }))}
      vehicles={vehicles.map((v) => ({
        id: v.id,
        license_plate: v.license_plate,
        vin: v.vin,
      }))}
      advisors={advisors.map((a) => ({
        id: a.id,
        emp_code: a.emp_code,
        name: a.name,
        position: a.position,
      }))}
      canEdit
      canCreateRO={canCreateRO}
      initialMode="create"
    />
  );
}

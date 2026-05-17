import { notFound, redirect } from "next/navigation";

import {
  getCustomerById,
  getServiceAppointmentById,
  listCustomers,
  listCustomerVehicles,
  listEmployees,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { AppointmentDetailView } from "./_components/appointment-detail-view";

export const dynamic = "force-dynamic";

export default async function EditAppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.APPOINTMENT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視預約的權限</p>
      </main>
    );
  }

  const [appointment, customers, vehicles, advisors] = await Promise.all([
    getServiceAppointmentById(id),
    listCustomers({ limit: 500 }),
    listCustomerVehicles({ activeOnly: false, limit: 500 }),
    listEmployees({ status: "active", limit: 200 }),
  ]);
  if (!appointment) notFound();

  // 確保現任客戶在 dropdown 內（即便被停用）
  const owner = await getCustomerById(appointment.customer_id);
  if (owner && !customers.find((c) => c.id === owner.id)) {
    customers.unshift(owner);
  }

  const canEdit = await hasPermission(PERMISSIONS.APPOINTMENT_EDIT);
  const canCreateRO = await hasPermission(PERMISSIONS.RO_CREATE);

  return (
    <AppointmentDetailView
      appointment={appointment}
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
      canEdit={canEdit}
      canCreateRO={canCreateRO}
    />
  );
}

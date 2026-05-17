import { redirect } from "next/navigation";

import {
  listCustomers,
  listCustomerVehicles,
  listEmployees,
  listServiceAppointments,
  APPOINTMENTS_PAGE_SIZE_DEFAULT,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { AppointmentsBoard } from "./_components/appointments-board";

export const dynamic = "force-dynamic";

export default async function AppointmentsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.APPOINTMENT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視預約的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = APPOINTMENTS_PAGE_SIZE_DEFAULT;

  const canEdit = await hasPermission(PERMISSIONS.APPOINTMENT_EDIT);
  const [appointmentsResult, customers, vehicles, advisors] = await Promise.all([
    listServiceAppointments({ page, pageSize }),
    listCustomers({ limit: 500 }),
    listCustomerVehicles({ activeOnly: false, limit: 500 }),
    listEmployees({ status: "active", limit: 200 }),
  ]);

  return (
    <AppointmentsBoard
      rows={appointmentsResult.rows}
      totalCount={appointmentsResult.totalCount}
      page={page}
      pageSize={pageSize}
      canEdit={canEdit}
      customers={customers.map((c) => ({ id: c.id, name: c.name }))}
      vehicles={vehicles.map((v) => ({
        id: v.id,
        license_plate: v.license_plate,
        vin: v.vin,
      }))}
      advisors={advisors.map((a) => ({ id: a.id, name: a.name }))}
    />
  );
}

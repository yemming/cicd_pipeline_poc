import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getAppointmentsListPageData,
  type AppointmentListFilters,
} from "@/domain/appointments";

import { AppointmentsBoard } from "../../parts/aftersales/appointments/_components/appointments-board";

export const dynamic = "force-dynamic";

export default async function ServiceAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.APPOINTMENT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視預約看板的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.APPOINTMENT_EDIT);
  const sp = await searchParams;

  const filters: AppointmentListFilters = {
    date: sp.date || undefined,
    status: sp.status || "all",
    service_type: sp.service_type || "all",
    technician_id: sp.technician_id || "all",
    q: sp.q || "",
  };

  const data = await getAppointmentsListPageData(filters);

  return (
    <AppointmentsBoard
      data={data}
      filters={filters}
      canEdit={canEdit}
      basePath="/service/appointments"
      pageHeader={{
        title: "預約看板",
        breadcrumb: [
          { label: "維修管理", href: "/service" },
          { label: "預約看板" },
        ],
        sprintChip: "售後 Phase 1",
      }}
    />
  );
}

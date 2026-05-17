import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getAppointmentDetailPageData } from "@/domain/appointments";

import { ServiceAppointmentDetailView } from "./_components/service-appointment-detail-view";

export const dynamic = "force-dynamic";

export default async function ServiceAppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.APPOINTMENT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視預約的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.APPOINTMENT_EDIT);
  const { id } = await params;
  const { appointment, lookups } = await getAppointmentDetailPageData(id);
  if (!appointment) notFound();
  return (
    <ServiceAppointmentDetailView
      appointment={appointment}
      lookups={lookups}
      canEdit={canEdit}
      initialMode="view"
    />
  );
}

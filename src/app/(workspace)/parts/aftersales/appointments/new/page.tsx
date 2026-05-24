import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getAppointmentNewPageData } from "@/domain/appointments";

import { AppointmentDetailView } from "../[id]/_components/appointment-detail-view";

export const dynamic = "force-dynamic";

export default async function AppointmentNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.APPOINTMENT_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有建立預約的權限</p>
      </main>
    );
  }
  const lookups = await getAppointmentNewPageData();
  const sp = await searchParams;
  return (
    <AppointmentDetailView
      appointment={null}
      lookups={lookups}
      canEdit={true}
      initialMode="create"
      initialDate={sp.date}
      initialCustomerId={sp.customer_id ?? null}
      initialVehicleId={sp.vehicle_id ?? null}
    />
  );
}

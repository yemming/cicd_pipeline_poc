import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getAppointmentDetailPageData } from "@/domain/appointments";
import { getServicePrivate } from "@/domain/customer-private";
import { ServicePrivateSection } from "@/components/customer/p08-private-sections";

import { AppointmentDetailView } from "./_components/appointment-detail-view";

export const dynamic = "force-dynamic";

export default async function AppointmentDetailPage({
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

  // P-08：appointment 對應的 customer 售後私房資料（僅 SVC / admin 看得到）
  const customerId = appointment.customer_id;
  const [canViewServiceP, canEditServiceP, servicePrivate] = await Promise.all([
    hasPermission(PERMISSIONS.CUSTOMER_SERVICE_PRIVATE_VIEW),
    hasPermission(PERMISSIONS.CUSTOMER_SERVICE_PRIVATE_EDIT),
    customerId ? getServicePrivate(customerId) : Promise.resolve(null),
  ]);

  return (
    <>
      <AppointmentDetailView
        appointment={appointment}
        lookups={lookups}
        canEdit={canEdit}
        initialMode="view"
      />
      {canViewServiceP && customerId && (
        <div className="px-6 pb-6 space-y-3">
          <ServicePrivateSection
            customerId={customerId}
            initial={servicePrivate}
            canEdit={canEditServiceP}
          />
        </div>
      )}
    </>
  );
}

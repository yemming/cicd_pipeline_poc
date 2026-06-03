import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCustomerById } from "@/domain/aftersales-customer-base";
import { getBrandConfig } from "@/domain/brand-config";
import { getActiveScope } from "@/lib/scope/active-scope";

import { CustomerDetailView } from "./_components/customer-detail-view";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視人車檔案的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const bundle = await getCustomerById(id);
  if (!bundle) notFound();

  const scope = await getActiveScope();
  const [canEdit, canEditAppointment, brandConfig] = await Promise.all([
    hasPermission(PERMISSIONS.CUSTOMER_EDIT),
    hasPermission(PERMISSIONS.APPOINTMENT_EDIT),
    getBrandConfig(scope.brand_id),
  ]);

  return (
    <CustomerDetailView
      customer={bundle.customer}
      vehicles={bundle.vehicles}
      workOrders={bundle.workOrders}
      repairOrders={bundle.repairOrders}
      appointments={bundle.appointments}
      followups={bundle.followups}
      officialTags={bundle.officialTags}
      pickupNotify={bundle.pickupNotify}
      models={bundle.models}
      lifetime={bundle.lifetime}
      npsSummary={bundle.npsSummary}
      canEdit={canEdit}
      canEditAppointment={canEditAppointment}
      hasDesmo={brandConfig.hasDesmo}
    />
  );
}

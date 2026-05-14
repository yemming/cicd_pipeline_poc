import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getAftersalesCustomerDetail } from "@/domain/aftersales-customer-base";

import { AftersalesCustomerBaseDetailView } from "./_components/aftersales-customer-base-detail-view";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視售後客戶基盤的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const { id } = await params;
  const bundle = await getAftersalesCustomerDetail(id);
  if (!bundle) notFound();

  return (
    <AftersalesCustomerBaseDetailView
      customer={bundle.customer}
      vehicles={bundle.vehicles}
      workOrders={bundle.workOrders}
      appointments={bundle.appointments}
      models={bundle.models}
      canEdit={canEdit}
      initialMode="view"
    />
  );
}

import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCustomerDetail } from "@/domain/customers";
import { listPostableAccounts } from "@/domain/accounting";

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
        <p className="text-[14px] text-[#BF2600]">沒有檢視客戶的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const [detail, accounts, canEdit] = await Promise.all([
    getCustomerDetail(id),
    listPostableAccounts(),
    hasPermission(PERMISSIONS.CUSTOMER_EDIT),
  ]);
  if (!detail) notFound();

  return <CustomerDetailView {...detail} accounts={accounts} canEdit={canEdit} />;
}

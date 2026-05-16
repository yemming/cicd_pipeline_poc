import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { AftersalesCustomerBaseDetailView } from "../[id]/_components/aftersales-customer-base-detail-view";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有新增客戶的權限</p>
      </main>
    );
  }
  return (
    <AftersalesCustomerBaseDetailView
      customer={null}
      vehicles={[]}
      workOrders={[]}
      appointments={[]}
      models={[]}
      canEdit
      initialMode="create"
    />
  );
}

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { DormantLeadDetailView } from "../[id]/_components/dormant-lead-detail-view";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有新增權限</p>
      </main>
    );
  }
  return (
    <DormantLeadDetailView
      lead={null}
      canEdit={true}
      initialMode="create"
      basePath="/crm/sales/dormant-leads"
      kind="sales"
    />
  );
}

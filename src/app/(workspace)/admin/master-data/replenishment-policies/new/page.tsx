import { redirect } from "next/navigation";

import { listWarehouses } from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { ReplenishmentPolicyDetailView } from "../[id]/_components/replenishment-policy-detail-view";

export const dynamic = "force-dynamic";

export default async function NewReplenishmentPolicyPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.REPLENISHMENT_POLICY_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立補貨計畫的權限</p>
      </main>
    );
  }

  const warehouses = await listWarehouses();

  return (
    <ReplenishmentPolicyDetailView
      policy={null}
      warehouses={warehouses}
      canEdit
      initialMode="create"
    />
  );
}

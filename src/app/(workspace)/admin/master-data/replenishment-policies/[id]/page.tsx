import { notFound, redirect } from "next/navigation";

import {
  getReplenishmentPolicyById,
  listWarehouses,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { ReplenishmentPolicyDetailView } from "./_components/replenishment-policy-detail-view";

export const dynamic = "force-dynamic";

export default async function EditReplenishmentPolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.REPLENISHMENT_POLICY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視補貨計畫的權限</p>
      </main>
    );
  }

  const [policy, warehouses] = await Promise.all([
    getReplenishmentPolicyById(id),
    listWarehouses(),
  ]);
  if (!policy) notFound();

  const canEdit = await hasPermission(PERMISSIONS.REPLENISHMENT_POLICY_EDIT);

  return (
    <ReplenishmentPolicyDetailView
      policy={policy}
      warehouses={warehouses}
      canEdit={canEdit}
    />
  );
}

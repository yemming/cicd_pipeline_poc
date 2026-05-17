import { redirect } from "next/navigation";

import {
  listReplenishmentPolicies,
  listWarehouses,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { ReplenishmentPoliciesBoard } from "./_components/replenishment-policies-board";

export const dynamic = "force-dynamic";

export default async function ReplenishmentPoliciesPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.REPLENISHMENT_POLICY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視補貨計畫設定的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.REPLENISHMENT_POLICY_EDIT);
  const [rows, warehouses] = await Promise.all([
    listReplenishmentPolicies(),
    listWarehouses(),
  ]);

  return (
    <ReplenishmentPoliciesBoard
      rows={rows}
      canEdit={canEdit}
      warehouses={warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name }))}
    />
  );
}

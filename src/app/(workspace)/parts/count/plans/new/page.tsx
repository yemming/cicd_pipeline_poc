import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getNewCountPlanFormData } from "@/domain/count";

import { CountPlanDetailView } from "../[id]/_components/count-plan-detail-view";

export const dynamic = "force-dynamic";

export default async function NewCountPlanPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.COUNT_PLAN))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有建立盤點計畫的權限</p>
      </main>
    );
  }

  const { warehouses } = await getNewCountPlanFormData();

  return (
    <CountPlanDetailView
      plan={null}
      warehouses={warehouses}
      canEdit={true}
      initialMode="create"
    />
  );
}

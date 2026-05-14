import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCountPlanById } from "@/domain/count";

import { CountPlanDetailView } from "./_components/count-plan-detail-view";

export const dynamic = "force-dynamic";

export default async function CountPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.COUNT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視盤點計畫的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const result = await getCountPlanById(id);
  if (!result) notFound();

  const canEdit = await hasPermission(PERMISSIONS.COUNT_PLAN);
  return (
    <CountPlanDetailView
      plan={result.plan}
      warehouses={result.warehouses}
      canEdit={canEdit}
      initialMode="view"
    />
  );
}

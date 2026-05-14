import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getCountSessionById,
  getNewCountSessionFormData,
} from "@/domain/count";

import { CountSessionDetailView } from "../../sessions/[id]/_components/count-session-detail-view";

export const dynamic = "force-dynamic";

export default async function CountAdjustmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.COUNT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視盤點差異的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const [result, formData, canEdit] = await Promise.all([
    getCountSessionById(id),
    getNewCountSessionFormData(),
    hasPermission(PERMISSIONS.COUNT_ADJUST),
  ]);
  if (!result) notFound();

  return (
    <CountSessionDetailView
      ct={result.ct}
      lines={result.lines}
      warehouses={formData.warehouses}
      canEdit={canEdit}
      initialMode="view"
    />
  );
}

import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getThresholdById,
  getNewThresholdFormData,
} from "@/domain/alerts";

import { ThresholdDetailView } from "./_components/threshold-detail-view";

export const dynamic = "force-dynamic";

export default async function ThresholdDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ALERT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視水位設定的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const detail = await getThresholdById(id);
  if (!detail) notFound();

  // 撈 items lookup（edit 模式雖然鎖住、但 detail 元件 props 需要）
  const { items } = await getNewThresholdFormData();

  return (
    <ThresholdDetailView
      threshold={detail.row}
      warehouses={detail.warehouses}
      items={items}
      canEdit={detail.canEdit}
      initialMode="view"
    />
  );
}

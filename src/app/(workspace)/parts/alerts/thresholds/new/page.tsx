import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getNewThresholdFormData } from "@/domain/alerts";

import { ThresholdDetailView } from "../[id]/_components/threshold-detail-view";

export const dynamic = "force-dynamic";

export default async function NewThresholdPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有編輯水位設定的權限</p>
      </main>
    );
  }

  const { warehouses, items, canEdit } = await getNewThresholdFormData();

  return (
    <ThresholdDetailView
      threshold={null}
      warehouses={warehouses}
      items={items}
      canEdit={canEdit}
      initialMode="create"
    />
  );
}

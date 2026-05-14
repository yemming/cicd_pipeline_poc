import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { WorkorderLoopDetailView } from "../[id]/_components/workorder-loop-detail-view";

export const dynamic = "force-dynamic";

export default async function NewWorkorderLoopPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有建立待料工單的權限</p>
      </main>
    );
  }

  return <WorkorderLoopDetailView entry={null} canEdit={true} initialMode="create" />;
}

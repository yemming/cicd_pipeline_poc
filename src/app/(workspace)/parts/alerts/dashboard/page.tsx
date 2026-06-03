import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getAlertDashboardData } from "@/domain/parts-alerts-dashboard";

import { AlertDashboardBoard } from "./_components/alert-dashboard-board";

export const dynamic = "force-dynamic";

export default async function AlertDashboardPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ALERT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視庫存告警儀表板的權限</p>
      </main>
    );
  }

  const data = await getAlertDashboardData();

  return <AlertDashboardBoard data={data} />;
}

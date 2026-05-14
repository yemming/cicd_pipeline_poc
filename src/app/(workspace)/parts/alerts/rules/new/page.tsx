import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { AlertRuleDetailView } from "../[id]/_components/alert-rule-detail-view";

export const dynamic = "force-dynamic";

export default async function NewAlertRulePage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有建立告警規則的權限</p>
      </main>
    );
  }

  return <AlertRuleDetailView rule={null} canEdit={true} initialMode="create" />;
}

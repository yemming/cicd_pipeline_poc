import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getAlertRuleById } from "@/domain/rules";

import { AlertRuleDetailView } from "./_components/alert-rule-detail-view";

export const dynamic = "force-dynamic";

export default async function AlertRuleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ALERT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視告警規則的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const res = await getAlertRuleById(id);
  if (!res) notFound();

  return <AlertRuleDetailView rule={res.row} canEdit={res.canEdit} />;
}

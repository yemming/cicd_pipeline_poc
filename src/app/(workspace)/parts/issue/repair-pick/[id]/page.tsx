import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getIssueById } from "@/domain/issues";

import { RepairPickDetailView } from "./_components/repair-pick-detail-view";

export const dynamic = "force-dynamic";

export default async function RepairPickDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ISSUE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視領料單的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const issue = await getIssueById(id);
  if (!issue) notFound();

  const canEdit = await hasPermission(PERMISSIONS.ISSUE_CREATE);
  return <RepairPickDetailView issue={issue} canEdit={canEdit} />;
}

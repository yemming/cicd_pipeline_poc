import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCaseById } from "@/domain/followup-cases";

import { FollowupCaseDetail } from "./_components/followup-case-detail";

export const dynamic = "force-dynamic";

export default async function FollowupCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視追蹤閉環的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);
  const { id } = await params;
  const { case: caseRow, events } = await getCaseById(id);
  if (!caseRow) notFound();

  return <FollowupCaseDetail caseRow={caseRow} events={events} canEdit={canEdit} />;
}

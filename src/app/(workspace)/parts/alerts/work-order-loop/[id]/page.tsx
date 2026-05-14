import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getWorkorderLoopEntryById } from "@/domain/alerts";

import { WorkorderLoopDetailView } from "./_components/workorder-loop-detail-view";

export const dynamic = "force-dynamic";

export default async function WorkorderLoopDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ALERT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視待料工單的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const res = await getWorkorderLoopEntryById(id);
  if (!res) notFound();

  return <WorkorderLoopDetailView entry={res.row} canEdit={res.canEdit} />;
}

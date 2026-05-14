import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getCallTaskDetail,
  getCallTaskLookups,
} from "@/domain/sales-call-tasks";

import { CallTaskDetailView } from "./_components/call-task-detail-view";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視電訪任務的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const { id } = await params;
  const task = await getCallTaskDetail(id);
  if (!task) notFound();

  const lookups = await getCallTaskLookups(task.kind);

  return (
    <CallTaskDetailView
      task={task}
      canEdit={canEdit}
      initialMode="view"
      customers={lookups.customers}
      surveys={lookups.surveys}
    />
  );
}

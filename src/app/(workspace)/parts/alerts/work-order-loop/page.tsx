import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getWorkorderLoopPageData, type WorkorderLoopStatus } from "@/domain/alerts";

import { WorkorderLoopBoard } from "./_components/workorder-loop-board";

export const dynamic = "force-dynamic";

export default async function WorkOrderLoopPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    overdue_only?: string;
  }>;
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

  const sp = (await searchParams) ?? {};
  const statusFilter = ["pending", "escalated", "resolved"].includes(sp.status ?? "")
    ? (sp.status as WorkorderLoopStatus)
    : "";
  const filter = {
    q: sp.q || undefined,
    status: statusFilter || undefined,
    overdue_only: sp.overdue_only === "true",
  };

  const { entries, canEdit } = await getWorkorderLoopPageData(filter);

  return (
    <WorkorderLoopBoard
      entries={entries}
      canEdit={canEdit}
      initialQ={sp.q ?? ""}
      initialStatus={statusFilter}
      initialOverdue={sp.overdue_only ?? ""}
    />
  );
}

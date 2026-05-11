import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getIssuesPageData } from "@/domain/issues";

import { IssuesBoard } from "../internal-sale/_components/issues-board";

export const dynamic = "force-dynamic";

export default async function RepairPickPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ISSUE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視出庫單的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const { rows, canEdit } = await getIssuesPageData({
    type: "repair_pick",
    status: sp.status || undefined,
    q: sp.q || undefined,
  });

  return (
    <IssuesBoard
      title="維修領料（RO 工單串接）"
      tag="6.1"
      subtitle="維修工單派工後從庫存領出料件"
      rows={rows}
      canEdit={canEdit}
      initialStatus={sp.status ?? ""}
      initialQ={sp.q ?? ""}
      basePath="/parts/issue/repair-pick"
    />
  );
}

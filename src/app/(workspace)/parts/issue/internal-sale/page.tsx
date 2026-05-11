import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getIssuesPageData } from "@/domain/issues";

import { IssuesBoard } from "./_components/issues-board";

export const dynamic = "force-dynamic";

export default async function InternalSaleIssuePage({
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
    type: "internal_sale",
    status: sp.status || undefined,
    q: sp.q || undefined,
  });

  return (
    <IssuesBoard
      title="內售出庫"
      tag="6.3"
      subtitle="員工 / 內部試乘 / 維修等內銷用途的備件出庫"
      rows={rows}
      canEdit={canEdit}
      initialStatus={sp.status ?? ""}
      initialQ={sp.q ?? ""}
      basePath="/parts/issue/internal-sale"
    />
  );
}

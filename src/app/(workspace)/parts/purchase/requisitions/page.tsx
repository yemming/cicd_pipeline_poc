import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getRequisitionsPageData } from "@/domain/requisitions";

import { RequisitionsBoard } from "./_components/requisitions-board";

export const dynamic = "force-dynamic";

export default async function RequisitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PR_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視採購需求的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const { rows, canEdit } = await getRequisitionsPageData({
    status: sp.status || undefined,
  });

  return <RequisitionsBoard rows={rows} canEdit={canEdit} initialStatus={sp.status ?? ""} />;
}

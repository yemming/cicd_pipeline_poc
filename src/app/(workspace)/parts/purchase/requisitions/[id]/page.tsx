import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getRequisitionDetailPageData } from "@/domain/requisitions";

import { RequisitionDetailView } from "./_components/requisition-detail-view";

export const dynamic = "force-dynamic";

export default async function RequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.PR_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視需求處理的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const data = await getRequisitionDetailPageData(id);
  if (!data) notFound();

  const canEdit = await hasPermission(PERMISSIONS.PR_CREATE);
  const canApprove = await hasPermission(PERMISSIONS.PR_APPROVE);

  return (
    <RequisitionDetailView
      {...data}
      canEdit={canEdit}
      canApprove={canApprove}
    />
  );
}

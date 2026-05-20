import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getInternalSaleIssueById,
  listDestinationStores,
} from "@/domain/internal-sale-issues";

import { InternalSaleDetailView } from "./_components/internal-sale-detail-view";

export const dynamic = "force-dynamic";

export default async function InternalSaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ISSUE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視內售出貨單的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const [issue, destinationStores] = await Promise.all([
    getInternalSaleIssueById(id),
    listDestinationStores(),
  ]);
  if (!issue) notFound();

  const canEdit = await hasPermission(PERMISSIONS.ISSUE_CREATE);
  return (
    <InternalSaleDetailView
      issue={issue}
      destinationStores={destinationStores}
      canEdit={canEdit}
    />
  );
}

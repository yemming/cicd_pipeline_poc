import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getTransferById,
  getTransferSubsidiaryInfo,
  getTransferTimeline,
} from "@/domain/transfers";

import { TransferDetailView } from "./_components/transfer-detail-view";

export const dynamic = "force-dynamic";

export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視調撥單的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const transfer = await getTransferById(id);
  if (!transfer) notFound();

  const [canEdit, subInfo, timeline] = await Promise.all([
    hasPermission(PERMISSIONS.RECEIPT_CREATE),
    getTransferSubsidiaryInfo(id),
    getTransferTimeline(id),
  ]);

  return (
    <TransferDetailView
      transfer={transfer}
      canEdit={canEdit}
      subsidiaryInfo={subInfo}
      timeline={timeline}
    />
  );
}

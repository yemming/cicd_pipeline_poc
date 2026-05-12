import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getTransferById } from "@/domain/transfers";

import { TransferOutDetailView } from "./_components/transfer-out-detail-view";

export const dynamic = "force-dynamic";

export default async function TransferOutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.TRANSFER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視調撥單的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const transfer = await getTransferById(id);
  if (!transfer) notFound();

  const canEdit = await hasPermission(PERMISSIONS.TRANSFER_CREATE);
  return <TransferOutDetailView transfer={transfer} canEdit={canEdit} />;
}

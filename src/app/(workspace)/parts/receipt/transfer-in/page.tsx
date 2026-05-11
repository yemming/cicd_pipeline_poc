import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getTransferInPageData } from "@/domain/transfers";

import { TransferInBoard } from "./_components/transfer-in-board";

export const dynamic = "force-dynamic";

export default async function TransferInPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視調撥入庫的權限</p>
      </main>
    );
  }

  const { rows, canEdit } = await getTransferInPageData();
  return <TransferInBoard rows={rows} canEdit={canEdit} />;
}

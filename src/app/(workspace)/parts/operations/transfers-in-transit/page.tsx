import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listTransfers } from "@/domain/transfers";

import { TransferInBoard } from "../../receipt/transfer-in/_components/transfer-in-board";

export const dynamic = "force-dynamic";

export default async function TransfersInTransitPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.TRANSFER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視調撥在途的權限</p>
      </main>
    );
  }

  const rows = await listTransfers({ status_in: ["in_transit", "partial"] });
  const canEdit = await hasPermission(PERMISSIONS.TRANSFER_CREATE);

  return <TransferInBoard rows={rows} canEdit={canEdit} />;
}

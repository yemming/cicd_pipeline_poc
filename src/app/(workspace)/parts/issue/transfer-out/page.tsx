import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listTransfers } from "@/domain/transfers";

import { TransferOutBoard } from "./_components/transfer-out-board";

export const dynamic = "force-dynamic";

export default async function TransferOutPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.TRANSFER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視調撥出庫的權限</p>
      </main>
    );
  }

  // 出貨方視角：只看 status in (draft, in_transit, partial)
  const rows = await listTransfers({ status_in: ["draft", "in_transit", "partial"] });
  const canEdit = await hasPermission(PERMISSIONS.TRANSFER_CREATE);

  return <TransferOutBoard rows={rows} canEdit={canEdit} />;
}

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getInternalSaleReceiptsPageData } from "@/domain/internal-sale-receipts";

import { InternalSaleBoard } from "./_components/internal-sale-board";

export const dynamic = "force-dynamic";

export default async function InternalSaleReceiptPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視內售入庫的權限</p>
      </main>
    );
  }

  const { rows, totalQty, totalAmount } = await getInternalSaleReceiptsPageData();

  return <InternalSaleBoard rows={rows} totalQty={totalQty} totalAmount={totalAmount} />;
}

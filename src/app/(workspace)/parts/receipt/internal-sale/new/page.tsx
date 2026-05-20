import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getNewPageLookups } from "@/domain/internal-sale-receipts";

import { InternalSaleDetailView } from "../[id]/_components/internal-sale-detail-view";

export const dynamic = "force-dynamic";

export default async function NewInternalSaleReceiptPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有建立內售入庫單的權限</p>
      </main>
    );
  }

  const { warehouses, customers, items, issues } = await getNewPageLookups();

  return (
    <InternalSaleDetailView
      detail={null}
      canEdit={true}
      warehouses={warehouses}
      customers={customers}
      items={items}
      issues={issues}
      initialMode="create"
    />
  );
}

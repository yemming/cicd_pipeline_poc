import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getInternalSaleReceiptById } from "@/domain/internal-sale-receipts";

import { InternalSaleDetailView } from "./_components/internal-sale-detail-view";

export const dynamic = "force-dynamic";

export default async function InternalSaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視內售入庫的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const detail = await getInternalSaleReceiptById(id);
  if (!detail) notFound();

  const canEdit = await hasPermission(PERMISSIONS.RECEIPT_CREATE);
  // edit / view 不需要完整 lookup（明細不可改），只 stub 空 array 給型別
  // 但若 user 在 detail page 上按「新增」會跳 /new，那邊重撈
  return (
    <InternalSaleDetailView
      detail={detail}
      canEdit={canEdit}
      warehouses={[]}
      customers={[]}
      items={[]}
      issues={[]}
      initialMode="view"
    />
  );
}

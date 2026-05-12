import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getReceiptById } from "@/domain/receipts";

import { ReceiptDetailView } from "./_components/receipt-detail-view";

export const dynamic = "force-dynamic";

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視入庫單的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const receipt = await getReceiptById(id);
  if (!receipt) notFound();

  const canEdit = await hasPermission(PERMISSIONS.RECEIPT_CREATE);
  return <ReceiptDetailView receipt={receipt} canEdit={canEdit} />;
}

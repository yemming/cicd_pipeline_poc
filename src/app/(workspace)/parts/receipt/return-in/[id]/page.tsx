import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getReceiptById } from "@/domain/receipts";

import { ReturnInDetailView } from "./_components/return-in-detail-view";

export const dynamic = "force-dynamic";

export default async function ReturnInDetailPage({
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
  if (receipt.type !== "ro_return") {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">
          此入庫單類型為 {receipt.type}、不屬於領料退貨入庫
        </p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.RECEIPT_CREATE);
  return <ReturnInDetailView receipt={receipt} canEdit={canEdit} />;
}

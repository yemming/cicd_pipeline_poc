import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getPurchaseOrderById } from "@/domain/orders";

import { PurchaseOrderDetailView } from "./_components/purchase-order-detail-view";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.PO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視採購單的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const order = await getPurchaseOrderById(id);
  if (!order) notFound();

  const canEdit = await hasPermission(PERMISSIONS.PO_CREATE);
  return <PurchaseOrderDetailView order={order} canEdit={canEdit} />;
}

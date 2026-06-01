/**
 * 進口採購單 — 詳情（reuse 整車採購 detail view，開進口/付款區段）
 */

import { redirect } from "next/navigation";

import { getVehiclePurchaseOrderById } from "@/domain/vehicle-purchase-orders";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import VehiclePODetailView from "../../../sales/inventory/purchase-orders/[id]/_components/vehicle-po-detail-view";

export const dynamic = "force-dynamic";

export default async function ImportPurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">進口採購管理僅限管理者使用</p>
      </main>
    );
  }

  const po = await getVehiclePurchaseOrderById(id);
  if (!po) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">找不到採購單 {id}</main>;
  }

  return (
    <VehiclePODetailView
      po={po}
      canEdit={isAdmin}
      basePath="/vehicle-import/purchase-orders"
      listLabel="進口採購單"
      showImportSection
    />
  );
}

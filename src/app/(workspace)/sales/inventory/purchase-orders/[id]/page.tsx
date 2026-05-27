/**
 * RS_INV01 整車採購訂單 — 詳情（view mode）
 */

import { getVehiclePurchaseOrderById } from "@/domain/vehicle-purchase-orders";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import VehiclePODetailView from "./_components/vehicle-po-detail-view";

export const dynamic = "force-dynamic";

export default async function VehiclePODetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">請先登入</main>;
  }
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_VIEW))) {
    return (
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">無權限檢視整車採購訂單</main>
    );
  }

  const [po, canEdit] = await Promise.all([
    getVehiclePurchaseOrderById(id),
    hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
  ]);

  if (!po) {
    return (
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">找不到採購單 {id}</main>
    );
  }

  return <VehiclePODetailView po={po} canEdit={canEdit} />;
}

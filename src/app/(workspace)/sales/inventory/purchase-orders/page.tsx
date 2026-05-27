/**
 * RS_INV01 整車採購訂單 — 列表
 *
 * 整車供應鏈起點：對原廠下整車採購訂單，追蹤在途狀態。
 * 送出後每筆車款明細在 new_car_inventory 建 in_transit 庫存 row。
 */

import {
  listVehiclePurchaseOrders,
  VEHICLE_PO_PAGE_SIZE_DEFAULT,
  type VehiclePOFilters,
} from "@/domain/vehicle-purchase-orders";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import VehiclePOBoard from "./_components/vehicle-po-board";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "整車採購訂單 | DealerOS",
};

export default async function VehiclePurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">請先登入</main>;
  }
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_VIEW))) {
    return (
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">無權限檢視整車採購訂單</main>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = VEHICLE_PO_PAGE_SIZE_DEFAULT;
  const filters: VehiclePOFilters = {
    status: sp.status ?? "all",
    q: sp.q ?? "",
  };

  const [{ rows, totalCount }, canEdit] = await Promise.all([
    listVehiclePurchaseOrders(filters, { page, pageSize }),
    hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
  ]);

  return (
    <VehiclePOBoard
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      canEdit={canEdit}
      filters={{ status: filters.status ?? "all", q: filters.q ?? "" }}
    />
  );
}

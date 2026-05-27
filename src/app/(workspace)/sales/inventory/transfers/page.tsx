/**
 * RS_INV04 車輛調撥 — 列表
 *
 * 車輛跨倉 / 跨點調撥管理。list + 申請 wizard。
 * 設計稿：docs/20260527/RS_INV04_車輛調撥.html
 */

import {
  listVehicleTransfers,
  getTransferBrandId,
  type VehicleTransferFilters,
} from "@/domain/vehicle-transfers";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import TransfersBoard from "./_components/transfers-board";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "車輛調撥 | DealerOS",
};

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    freight_type?: string;
    vehicle_kind?: string;
    q?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">請先登入</main>;
  }
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_VIEW))) {
    return (
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">無權限檢視車輛調撥</main>
    );
  }

  const sp = await searchParams;
  const brandId = await getTransferBrandId();
  const filters: VehicleTransferFilters = {
    status: sp.status || undefined,
    freight_type: sp.freight_type || undefined,
    vehicle_kind: sp.vehicle_kind || undefined,
    q: sp.q || undefined,
  };

  const [{ rows, totalCount }, canEdit] = await Promise.all([
    listVehicleTransfers(brandId, filters),
    hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
  ]);

  return (
    <TransfersBoard
      rows={rows}
      totalCount={totalCount}
      canEdit={canEdit}
      filters={{
        status: sp.status ?? "",
        freight_type: sp.freight_type ?? "",
        vehicle_kind: sp.vehicle_kind ?? "",
        q: sp.q ?? "",
      }}
    />
  );
}

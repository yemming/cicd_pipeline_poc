import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  listVehiclePurchaseOrders,
  type VehiclePOFilters,
} from "@/domain/vehicle-purchase-orders";

import { ImportPoBoard } from "./_components/import-po-board";

export const dynamic = "force-dynamic";

export default async function ImportPurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">進口採購管理僅限管理者使用</p>
      </main>
    );
  }
  const sp = await searchParams;
  const filters: VehiclePOFilters = {
    q: sp.q ?? "",
    status: sp.status ?? "all",
  };
  // 進口採購單通常量不大，一次撈足（沿用既有分頁 helper、給大 pageSize）
  const { rows } = await listVehiclePurchaseOrders(filters, { page: 1, pageSize: 500 });
  return <ImportPoBoard rows={rows} filters={filters} />;
}

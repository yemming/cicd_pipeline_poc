import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { listShipments, type ShipmentFilters } from "@/domain/import-shipments";

import { ShipmentsBoard } from "../shipments/_components/shipments-board";

export const dynamic = "force-dynamic";

export default async function LandedCostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">Landed Cost 結算僅限管理者使用</p>
      </main>
    );
  }
  const sp = await searchParams;
  const filters: ShipmentFilters = {
    q: sp.q ?? "",
    stage: sp.stage ?? "all",
    status: sp.status ?? "all",
  };
  const rows = await listShipments(filters);
  return <ShipmentsBoard rows={rows} filters={filters} mode="landed-cost" />;
}

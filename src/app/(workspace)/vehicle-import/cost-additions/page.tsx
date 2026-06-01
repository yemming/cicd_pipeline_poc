import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  listCostAdditions,
  listShipmentsForAddition,
  type CostAdditionFilters,
} from "@/domain/import-cost-additions";

import { CostAdditionsBoard } from "./_components/cost-additions-board";

export const dynamic = "force-dynamic";

export default async function CostAdditionsPage({
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
  const filters: CostAdditionFilters = { status: sp.status ?? "all" };
  const [rows, shipmentOptions] = await Promise.all([
    listCostAdditions(filters),
    listShipmentsForAddition(),
  ]);
  return <CostAdditionsBoard rows={rows} filters={filters} shipmentOptions={shipmentOptions} />;
}

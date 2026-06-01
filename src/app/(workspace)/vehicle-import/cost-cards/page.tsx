import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { listCostCards, type CostCardFilters } from "@/domain/import-cost-cards";

import { CostCardsBoard } from "./_components/cost-cards-board";

export const dynamic = "force-dynamic";

export default async function CostCardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">車輛成本歸集卡僅限管理者使用</p>
      </main>
    );
  }
  const sp = await searchParams;
  const filters: CostCardFilters = {
    q: sp.q ?? "",
    status: sp.status ?? "all",
    settled: sp.settled ?? "imported",
  };
  const rows = await listCostCards(filters);
  return <CostCardsBoard rows={rows} filters={filters} />;
}

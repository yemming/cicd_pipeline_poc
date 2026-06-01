import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getCostCard } from "@/domain/import-cost-cards";

import { CostCardView } from "./_components/cost-card-view";

export const dynamic = "force-dynamic";

export default async function CostCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
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
  const { id } = await params;
  const card = await getCostCard(id);
  if (!card) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">找不到車輛 {id}</p>
      </main>
    );
  }
  return <CostCardView card={card} />;
}

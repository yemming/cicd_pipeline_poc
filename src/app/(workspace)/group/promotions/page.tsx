import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  listPromoCampaigns,
  listPromoStoreExec,
  listPromoEffect,
  getPromoOverview,
} from "@/domain/group-promotions";
import { PromotionsBoard } from "./_components/promotions-board";

export const dynamic = "force-dynamic";

export default async function PromotionsPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="p-8 text-[14px] text-[#CC0000]">請先登入</main>;
  }

  const { brand_id } = await getActiveScope();
  const [campaigns, storeExec, effect, overview] = await Promise.all([
    listPromoCampaigns(brand_id),
    listPromoStoreExec(brand_id),
    listPromoEffect(brand_id),
    getPromoOverview(brand_id),
  ]);

  return (
    <PromotionsBoard
      campaigns={campaigns}
      storeExec={storeExec}
      effect={effect}
      overview={overview}
      canEdit={isAdmin}
    />
  );
}

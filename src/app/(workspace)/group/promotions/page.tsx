import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
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

  const brandId = "indian";
  const [campaigns, storeExec, effect, overview] = await Promise.all([
    listPromoCampaigns(brandId),
    listPromoStoreExec(brandId),
    listPromoEffect(brandId),
    getPromoOverview(brandId),
  ]);

  return (
    <PromotionsBoard
      campaigns={campaigns}
      storeExec={storeExec}
      effect={effect}
      overview={overview}
      canEdit={isAdmin}
      brandId={brandId}
    />
  );
}

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getPromoCampaign } from "@/domain/group-promotions";

import { PromotionDetailView } from "./_components/promotion-detail-view";

export const dynamic = "force-dynamic";

export default async function PromotionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="p-8 text-[14px] text-[#CC0000]">請先登入</main>;
  }

  const { brand_id } = await getActiveScope();
  const campaign = await getPromoCampaign(brand_id, id);

  return (
    <PromotionDetailView campaign={campaign} initialMode="view" canEdit={isAdmin} brandId={brand_id} />
  );
}

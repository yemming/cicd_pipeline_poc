import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";

import { PromotionDetailView } from "../[id]/_components/promotion-detail-view";

export const dynamic = "force-dynamic";

export default async function PromotionNewPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="p-8 text-[14px] text-[#CC0000]">請先登入</main>;
  }
  if (!isAdmin) {
    return <main className="p-8 text-[14px] text-[#CC0000]">需要管理員權限才能新增活動</main>;
  }

  const { brand_id } = await getActiveScope();

  return <PromotionDetailView campaign={null} initialMode="create" canEdit={isAdmin} brandId={brand_id} />;
}

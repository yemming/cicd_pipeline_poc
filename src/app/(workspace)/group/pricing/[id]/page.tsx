import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getPricingPolicy } from "@/domain/group-pricing";

import { PricingDetailView } from "./_components/pricing-detail-view";

export const dynamic = "force-dynamic";

/**
 * GRP14 定價政策詳情頁（view / edit；create 走 ../new）。
 * 權限守門沿用 list 頁 pattern：未登入導 /login、非 admin 紅字。
 */
export default async function PricingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">集團定價折扣設定僅限管理者使用</p>
      </main>
    );
  }

  const { brand_id } = await getActiveScope();
  const policy = await getPricingPolicy(brand_id, id);

  return <PricingDetailView policy={policy} initialMode="view" />;
}

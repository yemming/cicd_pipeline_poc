import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { PricingDetailView } from "../[id]/_components/pricing-detail-view";

export const dynamic = "force-dynamic";

/**
 * GRP14 新增定價項目 — reuse detail view 的 create mode（policy=null）。
 */
export default async function PricingNewPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">集團定價折扣設定僅限管理者使用</p>
      </main>
    );
  }

  return <PricingDetailView policy={null} initialMode="create" />;
}

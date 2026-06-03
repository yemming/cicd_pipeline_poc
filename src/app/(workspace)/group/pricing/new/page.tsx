import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { listServicePackages } from "@/domain/service-packages";

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

  const { brand_id } = await getActiveScope();
  const servicePackages = await listServicePackages(brand_id, { includeInactive: true });

  return (
    <PricingDetailView policy={null} initialMode="create" servicePackages={servicePackages} />
  );
}

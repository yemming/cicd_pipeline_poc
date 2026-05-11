import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getPricingPageData } from "@/domain/pricing";

import { PricingBoard } from "./_components/pricing-board";

export const dynamic = "force-dynamic";

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; q?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視門市定價的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const data = await getPricingPageData({
    store_id: sp.store || undefined,
    q: sp.q || undefined,
  });

  return (
    <PricingBoard
      stores={data.stores}
      rows={data.rows}
      activeStoreId={data.activeStoreId}
      activeStoreName={data.activeStoreName}
      canEdit={data.canEdit}
      initialQ={sp.q ?? ""}
    />
  );
}

/**
 * RS_INV05 中古車收購申請（直購）— 列表
 *
 * 中古車鏈「直購」入口：市場主動購入中古車 → 4 步驟 wizard → 確認收購 →
 * 建中古車主檔（pending_recon）+ 觸發 PD-UC 整備工單。
 */

import {
  listUsedPurchaseRequests,
  getUsedPurchaseBrandId,
  type UsedPurchaseFilter,
} from "@/domain/used-purchase-requests";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import UsedPurchaseBoard from "./_components/used-purchase-board";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "中古車收購申請 | DealerOS",
};

export default async function UsedPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; decision?: string; q?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">請先登入</main>;
  }
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_VIEW))) {
    return (
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">
        無權限檢視中古車收購申請
      </main>
    );
  }

  const sp = await searchParams;
  const brandId = await getUsedPurchaseBrandId();
  const filter: UsedPurchaseFilter = {
    brandId,
    sourceType: sp.source || undefined,
    decision: sp.decision || undefined,
    search: sp.q || undefined,
  };

  const [{ rows, totalCount }, canEdit] = await Promise.all([
    listUsedPurchaseRequests(filter),
    hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
  ]);

  return (
    <UsedPurchaseBoard
      rows={rows}
      totalCount={totalCount}
      canEdit={canEdit}
      filters={{
        source: sp.source ?? "",
        decision: sp.decision ?? "",
        q: sp.q ?? "",
      }}
    />
  );
}

/**
 * RS_INV03 整車採購財務結算 — 結算作業頁
 *
 * 選定採購單 → 輸入關 / 運 / 保 → 即時預覽各台分攤 → 確認寫回每台整車成本。
 */

import { getSettlementPODetail } from "@/domain/cost-settlement";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import CostSettlementForm from "../_components/cost-settlement-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "財務結算作業 | DealerOS",
};

export default async function CostSettlementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">請先登入</main>;
  }
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_VIEW))) {
    return (
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">無權限檢視財務結算</main>
    );
  }

  const [detail, canEdit] = await Promise.all([
    getSettlementPODetail(id),
    hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
  ]);

  if (!detail) {
    return (
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">找不到採購單 {id}</main>
    );
  }

  return <CostSettlementForm detail={detail} canEdit={canEdit} />;
}

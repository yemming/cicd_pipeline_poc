/**
 * RS_INV05 中古車收購申請 — 詳情（view mode）
 *
 * 顯示申請摘要 + 鑑價成本 + 決策結果（若已收購：中古車主檔號 + PD-UC 整備工單號）。
 * 尚未決策的申請單可從這裡直接「確認收購 / 不收購」。
 */

import { getUsedPurchaseRequestById } from "@/domain/used-purchase-requests";
import { getUsedCarById } from "@/domain/used-car-inventory";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import UsedPurchaseDetailView from "./_components/used-purchase-detail-view";

export const dynamic = "force-dynamic";

export default async function UsedPurchaseDetailPage({
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
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">
        無權限檢視中古車收購申請
      </main>
    );
  }

  const request = await getUsedPurchaseRequestById(id);
  if (!request) {
    return (
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">
        找不到收購申請 {id}
      </main>
    );
  }

  const [canEdit, usedCar] = await Promise.all([
    hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
    request.used_car_id ? getUsedCarById(request.used_car_id) : Promise.resolve(null),
  ]);

  return (
    <UsedPurchaseDetailView
      request={request}
      canEdit={canEdit}
      usedCar={
        usedCar
          ? {
              id: usedCar.id,
              model_display_name: usedCar.model_display_name,
              status: usedCar.status,
              recon_workorder_code: usedCar.recon_workorder_code,
            }
          : null
      }
    />
  );
}

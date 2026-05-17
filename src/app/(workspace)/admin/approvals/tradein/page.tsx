/**
 * /admin/approvals/tradein — 中古車收車（評估鑑價）簽核中心（P1-#8 第七輪 BDN）
 *
 * Server component：撈 used_car_evaluations where status='submitted'，傳給 client board。
 * UI 嚴禁直接 import @/lib/supabase；只透過 @/domain/used-car-evaluations helper。
 */

import { listEvaluations } from "@/domain/used-car-evaluations";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { TradeinApprovalsBoard } from "./_components/tradein-approvals-board";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return (
      <main className="px-6 py-5">
        <p className="text-[12.5px] text-[#CC0000]">請先登入</p>
      </main>
    );
  }

  const canApprove = await hasPermission(PERMISSIONS.USED_CAR_EVALUATION_APPROVE);

  const scope = await getActiveScope();
  const { rows } = await listEvaluations({
    brandId: scope.brand_id,
    status: "submitted",
  });

  return <TradeinApprovalsBoard rows={rows} canApprove={canApprove} />;
}

/**
 * /admin/approvals/order — 訂單送簽簽核中心（P1-#6 第七輪 BDN）
 *
 * Server component：撈 sales_orders where status='submitted'，傳給 client board。
 * UI 嚴禁直接 import @/lib/supabase；只透過 @/domain/sales-orders helper。
 */

import { listPendingApprovalOrders } from "@/domain/sales-orders";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { OrderApprovalsBoard } from "./_components/order-approvals-board";

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

  const canView = await hasPermission(PERMISSIONS.SALES_ORDER_VIEW);
  if (!canView) {
    return (
      <main className="px-6 py-5">
        <p className="text-[12.5px] text-[#CC0000]">沒有檢視訂單的權限</p>
      </main>
    );
  }
  const canApprove = await hasPermission(PERMISSIONS.SALES_ORDER_APPROVE);

  const rows = await listPendingApprovalOrders();

  return <OrderApprovalsBoard rows={rows} canApprove={canApprove} />;
}

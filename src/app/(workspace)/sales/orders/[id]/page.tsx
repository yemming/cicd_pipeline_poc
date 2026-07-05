/**
 * 訂單詳情頁 — /sales/orders/[id]
 */

import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSalesOrderById } from "@/domain/sales-orders";
import { getPaymentsByOrderId } from "@/domain/sales-payments";
import { getPendingApprovalForOrder } from "@/domain/discount-approvals";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import OrderDetailView from "./_components/order-detail-view";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;

  const [order, canEdit, canForfeit, canReplace, canApprove, canReassign] = await Promise.all([
    getSalesOrderById(id),
    hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
    hasPermission(PERMISSIONS.SALES_ORDER_FORFEIT),
    hasPermission(PERMISSIONS.SALES_ORDER_REPLACE),
    hasPermission(PERMISSIONS.SALES_ORDER_APPROVE),
    hasPermission(PERMISSIONS.SALES_ORDER_REASSIGN),
  ]);

  if (!order) {
    notFound();
  }

  // canUnlock = 主管才可解鎖（有 FORFEIT 或 APPROVE 權限）
  const canUnlock = canForfeit || canApprove;

  // 撈收款記錄（非阻塞；空陣列時 UI 顯示「尚無記錄」）
  let payments: Awaited<ReturnType<typeof getPaymentsByOrderId>> = [];
  try {
    payments = await getPaymentsByOrderId(id);
  } catch {
    // 非致命：payments 撈失敗不影響詳情頁
  }

  // RS04：待折扣審核 / 反價待回覆時，撈目前的審核申請給 RS 檢視
  let discountApproval: Awaited<ReturnType<typeof getPendingApprovalForOrder>> = null;
  try {
    discountApproval = await getPendingApprovalForOrder(id);
  } catch {
    // 非致命：撈失敗不影響詳情頁其餘功能
  }

  return (
    <Suspense fallback={null}>
      <OrderDetailView
        order={order}
        canEdit={canEdit}
        canForfeit={canForfeit}
        canReplace={canReplace}
        canUnlock={canUnlock}
        canReassign={canReassign}
        payments={payments}
        discountApproval={discountApproval}
      />
    </Suspense>
  );
}

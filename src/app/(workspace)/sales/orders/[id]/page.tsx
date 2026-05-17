/**
 * 訂單詳情頁 — /sales/orders/[id]
 */

import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSalesOrderById } from "@/domain/sales-orders";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import OrderDetailView from "./_components/order-detail-view";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;

  const [order, canEdit] = await Promise.all([
    getSalesOrderById(id),
    hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
  ]);

  if (!order) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <OrderDetailView order={order} canEdit={canEdit} />
    </Suspense>
  );
}

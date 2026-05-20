/**
 * 訂單中心 — List View (server component)
 *
 * RS04 成交訂單合約書列表 + 狀態管理 + A 級 KPI / Funnel（2026-05-20，M01-8）
 * 合約簽訂 wizard → /sales/orders/new
 * 合約詳情    → /sales/orders/[id]
 */

import { Suspense } from "react";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listSalesOrders,
  getSalesOrderKpis,
  getSalesOrderStatusBreakdown,
  ORDERS_PAGE_SIZE_DEFAULT,
} from "@/domain/sales-orders";
import OrdersBoard from "./_components/orders-board";

type SearchParams = {
  status?: string;
  contract_type?: string;
  q?: string;
  page?: string;
};

export default async function OrdersListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = ORDERS_PAGE_SIZE_DEFAULT;
  const filterStatus = sp.status ?? "";
  const filterContractType = sp.contract_type ?? "";
  const filterQ = sp.q ?? "";

  const canView = await hasPermission(PERMISSIONS.SALES_ORDER_VIEW);
  if (!canView) {
    return (
      <main className="px-6 py-5">
        <div className="text-[13px] text-[#CC0000]">
          沒有檢視訂單中心的權限。
        </div>
      </main>
    );
  }

  const [{ rows, totalCount }, kpis, statusBreakdown, canEdit] =
    await Promise.all([
      listSalesOrders({
        status: filterStatus || undefined,
        contract_type: filterContractType || undefined,
        q: filterQ || undefined,
        page,
        pageSize,
      }),
      getSalesOrderKpis(),
      getSalesOrderStatusBreakdown(),
      hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
    ]);

  return (
    <Suspense fallback={null}>
      <OrdersBoard
        rows={rows}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        kpis={kpis}
        statusBreakdown={statusBreakdown}
        filterStatus={filterStatus}
        filterContractType={filterContractType}
        filterQ={filterQ}
        canEdit={canEdit}
      />
    </Suspense>
  );
}

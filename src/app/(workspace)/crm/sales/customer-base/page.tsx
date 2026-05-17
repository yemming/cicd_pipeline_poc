import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getCustomerBaseListPageData,
  listSalesCustomersForCrmBoard,
  type CustomerBaseFilters,
  type SalesCustomerCrmFilters,
} from "@/domain/sales-customer-base";

import { CustomerBaseBoard } from "./_components/customer-base-board";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視客戶基盤的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const sp = await searchParams;

  // 既有 typed filters（給 table view 用）
  const filters: CustomerBaseFilters = {
    type: sp.type ?? "all",
    status: sp.status ?? "all",
    q: sp.q ?? "",
  };

  // CRM v2 filters（給 card / kanban view 用）
  const crmFilters: SalesCustomerCrmFilters = {
    quick: sp.quick ?? "all",
    follow_status: sp.follow_status ?? "all",
    q: sp.q ?? "",
  };

  const viewParam = sp.view;
  const view: "card" | "table" | "kanban" =
    viewParam === "table" ? "table" : viewParam === "kanban" ? "kanban" : "card";

  const [tableData, crmData] = await Promise.all([
    getCustomerBaseListPageData(filters),
    listSalesCustomersForCrmBoard(crmFilters),
  ]);

  return (
    <CustomerBaseBoard
      rows={tableData.rows}
      totalCount={tableData.totalCount}
      canEdit={canEdit}
      filters={filters}
      crmRows={crmData.rows}
      crmKpi={crmData.kpi}
      crmFilters={crmFilters}
      view={view}
    />
  );
}

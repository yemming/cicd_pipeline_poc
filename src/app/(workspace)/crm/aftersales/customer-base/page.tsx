import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getAftersalesCustomerBaseListPageData,
  listAftersalesCustomersForCrmBoard,
} from "@/domain/aftersales-customer-base";
import type { AftersalesCustomerBaseFilters } from "@/domain/aftersales-customer-base.constants";

import { AftersalesCustomerBaseBoard } from "./_components/aftersales-customer-base-board";

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
        <p className="text-[14px] text-[#BF2600]">沒有檢視售後客戶基盤的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const sp = await searchParams;

  // 既有 typed filters（給 table view 用）
  const filters: AftersalesCustomerBaseFilters = {
    service_status: sp.service_status ?? "all",
    type: sp.type ?? "all",
    q: sp.q ?? "",
  };

  // CRM v2 filters（給 card view 用）
  const crmFilters = {
    quick: sp.quick ?? "all",
    source: sp.source ?? "all",
    status: sp.status ?? "all",
    q: sp.q ?? "",
  };

  const view = sp.view === "table" ? "table" : "card";

  const [tableData, crmData] = await Promise.all([
    getAftersalesCustomerBaseListPageData(filters),
    listAftersalesCustomersForCrmBoard(crmFilters),
  ]);

  return (
    <AftersalesCustomerBaseBoard
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

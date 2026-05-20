import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getAftersalesCustomerBaseListPageDataWithKpi } from "@/domain/aftersales-customer-base";
import type { AftersalesCustomerBaseFilters } from "@/domain/aftersales-customer-base.constants";

import { CustomersBoard } from "./_components/customers-board";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視人車檔案的權限</p>
      </main>
    );
  }
  const sp = await searchParams;

  // 沿用售後客戶基盤 helper（SSOT 同一筆 customers）；本頁是「售後接待」視角，
  // 強調進廠 / 保固脈絡，CRM 視角的銷售追蹤透過 ★5 banner 跨模組互連。
  const filters: AftersalesCustomerBaseFilters = {
    service_status: sp.service_status ?? "all",
    type: sp.type ?? "all",
    q: sp.q ?? "",
  };

  const { rows, totalCount, kpi } =
    await getAftersalesCustomerBaseListPageDataWithKpi(filters);

  return (
    <CustomersBoard
      rows={rows}
      totalCount={totalCount}
      filters={filters}
      kpi={kpi}
    />
  );
}

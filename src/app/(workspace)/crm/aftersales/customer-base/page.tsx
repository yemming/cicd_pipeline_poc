import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getAftersalesCustomerBaseListPageData } from "@/domain/aftersales-customer-base";
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
  const filters: AftersalesCustomerBaseFilters = {
    service_status: sp.service_status ?? "all",
    type: sp.type ?? "all",
    q: sp.q ?? "",
  };
  const { rows, totalCount } =
    await getAftersalesCustomerBaseListPageData(filters);
  return (
    <AftersalesCustomerBaseBoard
      rows={rows}
      totalCount={totalCount}
      canEdit={canEdit}
      filters={filters}
    />
  );
}

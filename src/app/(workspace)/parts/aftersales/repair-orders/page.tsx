import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getRepairOrdersListPageData,
  type RepairOrderListFilters,
} from "@/domain/repair-orders";

import { RepairOrdersBoard } from "./_components/repair-orders-board";

export const dynamic = "force-dynamic";

export default async function RepairOrdersListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視維修工單的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);
  const sp = await searchParams;

  const filters: RepairOrderListFilters = {
    status: sp.status || "all",
    prefix_p1: sp.prefix_p1 || "all",
    prefix_p2: sp.prefix_p2 || "all",
    q: sp.q || "",
    date_from: sp.date_from || undefined,
    date_to: sp.date_to || undefined,
  };

  const data = await getRepairOrdersListPageData(filters);

  return <RepairOrdersBoard data={data} filters={filters} canEdit={canEdit} />;
}

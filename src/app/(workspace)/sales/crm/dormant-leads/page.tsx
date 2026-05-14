import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getDormantLeads,
  getDormantLeadStats,
  type DormantLeadFilters,
} from "@/domain/sales-dormant-leads";

import { DormantLeadsBoard } from "./_components/dormant-leads-board";

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
        <p className="text-[14px] text-[#BF2600]">沒有檢視休眠戰敗管理的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const sp = await searchParams;
  const filters: DormantLeadFilters = {
    status: sp.status ?? "all",
    habc: sp.habc ?? "all",
    reason: sp.reason ?? "all",
    q: sp.q ?? "",
    kind: "sales",
  };
  const [rows, stats] = await Promise.all([
    getDormantLeads(filters),
    getDormantLeadStats("sales"),
  ]);
  return (
    <DormantLeadsBoard
      rows={rows}
      totalCount={rows.length}
      canEdit={canEdit}
      filters={filters}
      stats={stats}
      basePath="/sales/crm/dormant-leads"
      kind="sales"
    />
  );
}

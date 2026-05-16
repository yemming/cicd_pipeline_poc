/**
 * 休眠流失管理（售後）List Page · CSAT05A
 *
 * Thin re-export：reuse sales 版 DormantLeadsBoard，
 * basePath = /crm/aftersales/dormant-customers、kind = 'aftersales'。
 *
 * Schema 共用同一張 sales_leads 表（kind = 'sales' | 'aftersales' 區隔）。
 */

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getDormantLeads,
  getDormantLeadStats,
  type DormantLeadFilters,
} from "@/domain/sales-dormant-leads";

import { DormantLeadsBoard } from "../../sales/dormant-leads/_components/dormant-leads-board";

export const dynamic = "force-dynamic";

const BASE_PATH = "/crm/aftersales/dormant-customers";

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
        <p className="text-[14px] text-[#BF2600]">沒有檢視休眠流失管理的權限</p>
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
    kind: "aftersales",
  };
  const [rows, stats] = await Promise.all([
    getDormantLeads(filters),
    getDormantLeadStats("aftersales"),
  ]);
  return (
    <DormantLeadsBoard
      rows={rows}
      totalCount={rows.length}
      canEdit={canEdit}
      filters={filters}
      stats={stats}
      basePath={BASE_PATH}
      kind="aftersales"
    />
  );
}

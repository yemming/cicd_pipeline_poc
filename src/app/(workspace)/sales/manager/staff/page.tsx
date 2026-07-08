import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listSalesStaff,
  listAvailableSeries,
} from "@/domain/sales-staff";
import { SALES_STAFF_PAGE_SIZE_DEFAULT } from "@/domain/sales-staff.constants";

import { SalesStaffBoard } from "./_components/sales-staff-board";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "RS 人員管理 | DealerOS",
};

type SearchParams = Promise<{
  q?: string;
  status?: string;
  series?: string;
  page?: string;
}>;

/**
 * RS_M3 主管設定 — Tab3 RS 人員（sales 視角）
 *
 * 設計稿來源：docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html § Tab3
 * Proposal：docs/proposals/feature-rs-m3-staff-phase1.md
 *
 * - 主表：employees（dept_code='SAL'）
 * - 負責車系：metadata.sales.responsible_models（jsonb）
 * - 接觸 / 成交數：本月 sales_leads count by rs_name
 * - 員工 CRUD 仍走 /admin/navigation/users；本頁只做「指派車系 / 啟用停用」
 */
export default async function SalesManagerStaffPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EMPLOYEE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視員工名冊的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const filters = {
    q: sp.q ?? "",
    status: (sp.status ?? "all") as "all" | "active" | "inactive",
    series: sp.series ?? "all",
  };
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const pageSize = SALES_STAFF_PAGE_SIZE_DEFAULT;

  const [{ rows, totalCount }, availableSeries, canEdit, canReassign] = await Promise.all([
    listSalesStaff(filters, { page, pageSize }),
    listAvailableSeries(),
    hasPermission(PERMISSIONS.EMPLOYEE_EDIT),
    hasPermission(PERMISSIONS.SALES_ORDER_REASSIGN),
  ]);

  return (
    <SalesStaffBoard
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      availableSeries={availableSeries}
      filters={filters}
      canEdit={canEdit}
      canReassign={canReassign}
    />
  );
}

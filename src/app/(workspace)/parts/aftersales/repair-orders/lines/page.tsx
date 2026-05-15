import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getRoLinesSummaryPageData,
  type RoLinesSummaryFilters,
} from "@/domain/repair-order-lines";

import { LinesLandingBoard } from "./_components/lines-landing-board";

export const dynamic = "force-dynamic";

/**
 * 「核對明細」landing — nav_node 入口
 *
 * 列出本 brand 全部 RO + 工項/零件/折扣彙總。
 * user 點某張 RO → /parts/aftersales/repair-orders/[id]/lines 編輯明細。
 *
 * 主要工作頁是 /parts/aftersales/repair-orders/[id]/lines。
 */
export default async function RepairOrderLinesLandingPage({
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

  const filters: RoLinesSummaryFilters = {
    status: sp.status || "all",
    q: sp.q || "",
    date_from: sp.date_from || undefined,
    date_to: sp.date_to || undefined,
    empty_only: sp.empty_only === "1",
  };

  const data = await getRoLinesSummaryPageData(filters);

  return <LinesLandingBoard data={data} filters={filters} canEdit={canEdit} />;
}

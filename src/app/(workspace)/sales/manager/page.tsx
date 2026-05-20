import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getManagerHubData } from "@/domain/sales-manager-hub";

import ManagerHubView from "./_components/manager-hub-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "主管工作台 | DealerOS",
};

/**
 * /sales/manager — RS_M3 主管工作台 hub。
 *
 * Spec：docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html
 * 工項：M01-3「主管設定集 hub 升 A 級」
 *
 * 行為：
 * - 列出 6 張子模組 KpiCard（funnel / sales-report / kpi-targets / staff /
 *   staff-grid / card-config），每張顯示當月關鍵 snapshot + 一鍵進入。
 * - 權限：與子頁一致用 SALES_ORDER_VIEW（業務模組通用查看）；EMPLOYEE_EDIT
 *   作為 canEdit 旗標傳給 view 顯示「唯讀視角」chip。
 * - 三狀態：empty（六張都 0）／error（部分 query 失敗，顯示 amber banner）
 *   ／normal。三種狀態 helper 已內建處理，view 只負責渲染。
 */
export default async function SalesManagerHubPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視主管工作台的權限</p>
      </main>
    );
  }

  const [data, canEdit] = await Promise.all([
    getManagerHubData(),
    hasPermission(PERMISSIONS.EMPLOYEE_EDIT),
  ]);

  return <ManagerHubView data={data} canEdit={canEdit} />;
}

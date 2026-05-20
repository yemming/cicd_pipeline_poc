import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCardConfigBoardData } from "@/domain/sales-settings";

import CardConfigBoard from "./_components/card-config-board";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "手卡參數設定 | DealerOS",
};

/**
 * RS_M3 主管設定 — 手卡參數（A 級）
 *
 * 工項：M01-4「/sales/manager/card-config 升 A 級」
 * Spec：docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html
 *
 * A 級升級要點：
 *   1. KpiCard 統計頂卡（5 張）
 *   2. 左 sidebar (category list) + 右內容 panel 結構（取代原 reuse 的 settings/handcard-params view）
 *   3. 權限 gate（SALES_ORDER_VIEW 看，SALES_ORDER_EDIT 才能寫）
 *   4. pending / error / empty 三狀態完整
 *   5. 雙 brand seed 完整（dict 45 / threshold 4 / flag 5）
 *
 * 與 /sales/settings/handcard-params 共用 helper（`@/domain/sales-settings`），
 * 但 view 完全獨立 — settings 是舊單張長頁，manager 是 A 級 sidebar 結構。
 */
export default async function SalesManagerCardConfigPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_VIEW))) {
    return (
      <main className="px-6 py-10">
        <div className="max-w-md mx-auto text-center text-[14px] text-[#CC0000] bg-[#FDECEA] border border-[#F5AEAD] rounded-lg px-6 py-8">
          <div className="text-[20px] mb-2">🔒</div>
          <div className="font-semibold mb-1">無權限查看手卡參數設定</div>
          <div className="text-[12px] text-[#854F0B]">需要 sales.order.view 權限</div>
        </div>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  const data = await getCardConfigBoardData();

  return <CardConfigBoard data={data} canEdit={canEdit} />;
}

import { redirect } from "next/navigation";

import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { listItemsWithLeadTime } from "@/domain/items";

import { ItemLeadTimesBoard } from "./_components/item-lead-times-board";

export const dynamic = "force-dynamic";

export default async function ItemLeadTimesPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視料號的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.ITEM_EDIT);

  const rows = await listItemsWithLeadTime();
  const filledCount = rows.filter((r) => r.default_lead_time_days !== null).length;

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">料號預設前置時間</h1>
        <p className="text-[13px] text-[#6B778C]">
          共 {rows.length} 筆 ・ 已設定 {filledCount} 筆 ・
          MRP 計算時若該料沒有 supplier_item_pricing，就吃這個 fallback 值
        </p>
      </header>

      <div className="bg-[#DEEBFF] border border-[#B3D4FF] rounded-md px-4 py-2.5 text-[12.5px] text-[#0747A6]">
        💡 直接在右側欄位編輯數字，blur 或 Enter 自動儲存。空白＝沒設值（MRP 將套用 7 天預設）。
      </div>

      <ItemLeadTimesBoard rows={rows} canEdit={canEdit} />
    </main>
  );
}

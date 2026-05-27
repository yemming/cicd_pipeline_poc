/**
 * RS_INV05 中古車收購申請 — 新增（4 步驟 wizard）
 *
 * STEP 1 基本資訊 → STEP 2 車輛資料 → STEP 3 鑑價與成本 → STEP 4 收購決策。
 * STEP 4「確認收購」→ 建中古車主檔 + 觸發 PD-UC 整備工單。
 */

import {
  getUsedPurchaseBrandId,
  nextApplicationNo,
} from "@/domain/used-purchase-requests";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import UsedPurchaseWizard from "../_components/used-purchase-wizard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "新增中古車收購申請 | DealerOS",
};

export default async function NewUsedPurchasePage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">請先登入</main>;
  }
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) {
    return (
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">
        無權限建立中古車收購申請
      </main>
    );
  }

  const brandId = await getUsedPurchaseBrandId();
  const applicationNo = await nextApplicationNo(brandId);

  return <UsedPurchaseWizard applicationNo={applicationNo} canEdit={canEdit} />;
}

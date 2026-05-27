/**
 * RS_INV02 到港確認 — 新增（4 步驟 wizard）
 *
 * STEP 1 選採購單（有在途車）→ STEP 2 逐台掃 VIN → STEP 3 損傷記錄 → STEP 4 確認觸發 PDI。
 */

import {
  listIncomingPurchaseOrders,
  getArrivalBrandId,
} from "@/domain/vehicle-arrivals";
import { listVehicleWarehouses } from "@/domain/vehicle-purchase-orders";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import ArrivalWizard from "../_components/arrival-wizard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "新增到港確認 | DealerOS",
};

export default async function NewArrivalPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">請先登入</main>;
  }
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_EDIT))) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">無權限建立到港確認</main>;
  }

  const brandId = await getArrivalBrandId();
  const [pos, warehouses] = await Promise.all([
    listIncomingPurchaseOrders(brandId),
    listVehicleWarehouses(),
  ]);

  return <ArrivalWizard pos={pos} warehouses={warehouses} />;
}

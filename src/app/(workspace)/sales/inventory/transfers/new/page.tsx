/**
 * RS_INV04 車輛調撥 — 新增（申請 wizard）
 *
 * 選車（new + used）→ 選來去倉 → 選運費承擔（5 種）→ A 類主管二次確認 → 送出。
 * A_VEHICLE_COST 會把運費寫回該車 transfer_freight_cost、影響毛利。
 */

import {
  getTransferBrandId,
  nextTransferNo,
  listTransferableVehicles,
  getWarehouseOptions,
} from "@/domain/vehicle-transfers";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import TransferWizard from "../_components/transfer-wizard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "新增車輛調撥 | DealerOS",
};

export default async function NewTransferPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">請先登入</main>;
  }
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) {
    return (
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">無權限建立車輛調撥</main>
    );
  }

  const brandId = await getTransferBrandId();
  const [transferNo, vehicles, warehouses] = await Promise.all([
    nextTransferNo(brandId),
    listTransferableVehicles(brandId),
    getWarehouseOptions(brandId),
  ]);

  return (
    <TransferWizard
      transferNo={transferNo}
      vehicles={vehicles}
      warehouses={warehouses}
      canEdit={canEdit}
    />
  );
}

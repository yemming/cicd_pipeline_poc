/**
 * RS_INV01 整車採購訂單 — 新增（wizard）
 *
 * 採購單 = 跨多表（單頭 + N 車輛明細），屬 design pattern §邊界允許的 multi-step 例外。
 * 提交後每筆明細依 qty 在 new_car_inventory 建 in_transit 庫存 row。
 */

import {
  listVehicleModels,
  listVehicleWarehouses,
  nextVehiclePONo,
  getVehiclePOBrandId,
} from "@/domain/vehicle-purchase-orders";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import VehiclePOWizard from "../_components/vehicle-po-wizard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "新增整車採購訂單 | DealerOS",
};

export default async function NewVehiclePOPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">請先登入</main>;
  }
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_EDIT))) {
    return (
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">無權限建立整車採購訂單</main>
    );
  }

  const brandId = await getVehiclePOBrandId();
  const [vehicleModels, warehouses, previewPoNo] = await Promise.all([
    listVehicleModels(),
    listVehicleWarehouses(),
    nextVehiclePONo(brandId),
  ]);

  return (
    <VehiclePOWizard
      vehicleModels={vehicleModels}
      warehouses={warehouses}
      previewPoNo={previewPoNo}
    />
  );
}

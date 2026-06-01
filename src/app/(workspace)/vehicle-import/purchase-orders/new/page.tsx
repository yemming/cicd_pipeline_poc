/**
 * 進口採購單 — 新增（reuse 整車採購 wizard，basePath 指回 vehicle-import）
 */

import { redirect } from "next/navigation";

import {
  listVehicleModels,
  listVehicleWarehouses,
  nextVehiclePONo,
  getVehiclePOBrandId,
} from "@/domain/vehicle-purchase-orders";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import VehiclePOWizard from "../../../sales/inventory/purchase-orders/_components/vehicle-po-wizard";

export const dynamic = "force-dynamic";

export default async function NewImportPurchaseOrderPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">進口採購管理僅限管理者使用</p>
      </main>
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
      basePath="/vehicle-import/purchase-orders"
    />
  );
}

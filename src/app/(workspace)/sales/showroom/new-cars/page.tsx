/**
 * /sales/showroom/new-cars — 展廳新車庫存（dealer 視角）
 *
 * DB 資料源：new_car_inventory（展廳現場現貨）
 * 庫管視角 /inventory/vehicles 同源不同切面，共用 domain helper。
 * RS 視角 /sales/showroom/stock 繼續走 sales-newcar-inventory mock（待升級）。
 */

import {
  listNewCars,
  getVehicleModelOptions,
  getOrganizationOptions,
  getCurrentBrandId,
  getNewCarKpiSummary,
  getNewCarInventoryByModel,
  getNewCarSlowMovers,
} from "@/domain/new-car-inventory";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import NewCarInventoryBoard from "./_components/inventory-board";

export const metadata = {
  title: "新車庫存 | DealerOS",
};

export default async function NewCarsPage() {
  const [rows, vehicleModels, organizations, brandId, kpi, byModel, slowMovers, canViewCost] =
    await Promise.all([
      listNewCars(),
      getVehicleModelOptions(),
      getOrganizationOptions(),
      getCurrentBrandId(),
      getNewCarKpiSummary(),
      getNewCarInventoryByModel(),
      getNewCarSlowMovers(90),
      hasPermission(PERMISSIONS.SALES_COST_VIEW),
    ]);

  return (
    <NewCarInventoryBoard
      initialRows={rows}
      vehicleModels={vehicleModels}
      organizations={organizations}
      brandId={brandId}
      kpi={kpi}
      byModel={byModel}
      slowMovers={slowMovers}
      canViewCost={canViewCost}
    />
  );
}

/**
 * `/sales/showroom/stock` — 新車庫存看板（RS 視角）。
 *
 * 輪3-1a：改呼叫真實 DB（listNewCars / new-car-inventory helper），
 * 移除舊的靜態 NEW_CAR_INVENTORY_UNITS mock 依賴。
 *
 * 與 `/sales/showroom/new-cars`（經銷商視角）共用同一個 board，
 * 視角差異透過 `viewMode="rs"` prop 切：
 *   - page header 標題加「（RS 視角）」+ RS chip
 *   - caption 改成銷售接待第一現場的口吻
 *   - RS 視角只顯示展廳相關狀態（arrived / displayed / reserved），不顯示 in_transit / PDI
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
import NewCarInventoryBoard from "../new-cars/_components/inventory-board";

export const metadata = {
  title: "新車庫存看板（RS 視角） | DealerOS",
};

export default async function ShowroomStockPage() {
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
      viewMode="rs"
    />
  );
}

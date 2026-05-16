/**
 * /inventory/vehicles — 整車庫存（庫管視角）
 *
 * v2 spec A8（`RS03A_新車庫存看板_v1.html`）兩視角共用：
 *   - 庫管視角 `/inventory/vehicles`（本頁，A8 經銷商視角升級）
 *   - 銷售模組 dealer 視角 `/sales/showroom/new-cars`
 *   - RS 視角 `/sales/showroom/stock`（viewMode='rs'）
 *
 * Day 1 三視角資料同源（NEW_CAR_INVENTORY_UNITS），UI 差異在 NewCarInventoryBoard
 * 內依 `viewMode` 切 page header / chip / caption。庫管視角專屬欄位（進貨/在途/退倉）
 * 等實際需求出現再 promote 到 helper。
 */

import { getNewCarInventory } from "@/domain/sales-newcar-inventory";
import NewCarInventoryBoard from "@/app/(workspace)/sales/showroom/new-cars/_components/newcar-inventory-board";

export const metadata = {
  title: "整車庫存 | DealerOS",
};

export default async function InventoryVehiclesPage() {
  const data = await getNewCarInventory();
  return <NewCarInventoryBoard data={data} viewMode="inventory" />;
}

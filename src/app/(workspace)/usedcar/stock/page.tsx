/**
 * /usedcar/stock — 中古車庫存看板（中古車輛模組）
 *
 * v2 spec A9（`RS03B_中古車庫存看板_v1.html`）— RS / 銷售主管 / 庫管 多角色共用。
 * 與 `/sales/showroom/used-cars` 同源資料、同元件，差異只在 page header breadcrumb / chip
 * 走中古車輛模組（不是銷售模組）。
 */

import { getUsedCarInventory } from "@/domain/sales-usedcar-inventory";
import UsedCarInventoryBoard from "@/app/(workspace)/sales/showroom/used-cars/_components/usedcar-inventory-board";

export const metadata = {
  title: "中古車庫存看板 | DealerOS",
};

export default async function UsedCarStockPage() {
  const data = await getUsedCarInventory();
  return <UsedCarInventoryBoard data={data} viewMode="usedcar" />;
}

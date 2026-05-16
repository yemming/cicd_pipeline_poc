/**
 * `/sales/showroom/stock` — 新車庫存看板（RS 視角）。
 *
 * 對應 DUCATI v2 設計稿 `RS03A_新車庫存看板_v1.html`。
 *
 * 與 `/sales/showroom/new-cars`（經銷商視角）共用同一個 board，
 * 視角差異透過 `viewMode="rs"` prop 切：
 *   - page header 標題加「（RS 視角）」+ RS chip
 *   - breadcrumb 改成「銷售接待 / 展廳接待 / 新車庫存（RS 視角）」
 *   - caption 改成銷售接待第一現場的口吻
 *
 * Day 1 資料源同 dealer view（NEW_CAR_INVENTORY_UNITS），未來 RS 視角會收斂
 * 到「本店可推薦庫存 + 客戶配車狀態」，那時改 domain helper 內部即可。
 */

import { getNewCarInventory } from "@/domain/sales-newcar-inventory";
import NewCarInventoryBoard from "../new-cars/_components/newcar-inventory-board";

export const metadata = {
  title: "新車庫存看板（RS 視角） | DealerOS",
};

export default async function ShowroomStockPage() {
  const data = await getNewCarInventory();
  return <NewCarInventoryBoard data={data} viewMode="rs" />;
}

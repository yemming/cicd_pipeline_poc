/**
 * /usedcar/stock — 中古車庫存看板（中古車輛模組）
 *
 * 與 /sales/showroom/used-cars 同源資料、同元件，差異只在 viewMode="usedcar"
 * → page header breadcrumb 走「中古車輛」而非「展廳接待」。
 */

import { listUsedCars } from "@/domain/used-car-inventory";
import UsedCarsBoard from "@/app/(workspace)/sales/showroom/used-cars/_components/used-cars-board";

export const metadata = {
  title: "中古車庫存 | DealerOS",
};

export default async function UsedCarStockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const brandId = "indian"; // TODO: 從 session 取得

  const { units, totalCount } = await listUsedCars({
    brandId,
    status: sp.status || undefined,
    conditionGrade: sp.grade || undefined,
    kmRange: sp.km || undefined,
    search: sp.q || undefined,
  });

  return (
    <UsedCarsBoard
      rows={units}
      totalCount={totalCount}
      viewMode="usedcar"
    />
  );
}

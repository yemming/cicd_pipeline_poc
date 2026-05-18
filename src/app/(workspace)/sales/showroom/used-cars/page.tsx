import { listUsedCars } from "@/domain/used-car-inventory";
import UsedCarInventoryBoard from "./_components/inventory-board";

export const metadata = {
  title: "中古車庫存 | DealerOS",
};

export default async function UsedCarsPage({
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
    <UsedCarInventoryBoard
      rows={units}
      totalCount={totalCount}
      viewMode="dealer"
    />
  );
}

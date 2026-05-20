import {
  listUsedCars,
  getCurrentBrandId,
  getUsedCarKpis,
  getUsedCarByModel,
  getUsedCarSlowMovers,
} from "@/domain/used-car-inventory";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import UsedCarInventoryBoard from "./_components/inventory-board";

export const metadata = {
  title: "中古車庫存 | DealerOS",
};

export default async function UsedCarsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  // 權限 gate — 沒有 sales.order.view 直接擋
  const canView = await hasPermission(PERMISSIONS.SALES_ORDER_VIEW);
  if (!canView) {
    return (
      <main className="px-6 py-8">
        <div className="bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] px-4 py-3 rounded text-[13px]">
          權限不足：需要 sales.order.view 才能檢視中古車庫存。請聯絡管理員。
        </div>
      </main>
    );
  }

  const sp = await searchParams;
  const brandId = await getCurrentBrandId();

  const [{ units, totalCount }, kpi, byModel, slowMovers] = await Promise.all([
    listUsedCars({
      brandId,
      status: sp.status || undefined,
      conditionGrade: sp.grade || undefined,
      kmRange: sp.km || undefined,
      search: sp.q || undefined,
    }),
    getUsedCarKpis(brandId),
    getUsedCarByModel(brandId),
    getUsedCarSlowMovers(brandId, 90),
  ]);

  return (
    <UsedCarInventoryBoard
      rows={units}
      totalCount={totalCount}
      viewMode="dealer"
      kpi={kpi}
      byModel={byModel}
      slowMovers={slowMovers}
    />
  );
}

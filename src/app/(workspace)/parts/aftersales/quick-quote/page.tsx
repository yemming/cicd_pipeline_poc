import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { listServicePackages, listLaborRates } from "@/domain/service-packages";
import { getInventoryBalanceWithAlerts, type BalanceRow } from "@/domain/parts-balance";
import { listVehiclePendingItems, type VehiclePendingItem } from "@/domain/service-quotes";

import { QuickQuoteBoard } from "./_components/quick-quote-board";

export const dynamic = "force-dynamic";

export default async function QuickQuotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">請先登入</p>
      </main>
    );
  }
  if (!(await hasPermission(PERMISSIONS.INSPECTION_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視快速報價的權限</p>
      </main>
    );
  }

  const scope = await getActiveScope();
  const brandId = scope.brand_id;

  const sp = await searchParams;
  const mileageRaw = sp.mileage ? Number(sp.mileage) : undefined;
  const mileage = typeof mileageRaw === "number" && Number.isFinite(mileageRaw) ? mileageRaw : undefined;
  const vehicleId = sp.vehicleId || undefined;
  const preInspectionId = sp.preInspectionId || undefined;

  const vehicle = {
    plate: sp.plate ?? null,
    model: sp.model ?? null,
    year: sp.year ?? null,
    mileage: mileage ?? null,
    customer: sp.customer ?? null,
    warranty: sp.warranty ?? null,
    vehicleId: vehicleId ?? null,
    preInspectionId: preInspectionId ?? null,
  };

  const [packages, laborRates, balance, pendingItems, canEdit] = await Promise.all([
    listServicePackages(brandId, { mileage }),
    listLaborRates(brandId),
    getInventoryBalanceWithAlerts({}, { page: 1, pageSize: 10_000 }),
    vehicleId
      ? listVehiclePendingItems(brandId, vehicleId)
      : Promise.resolve([] as VehiclePendingItem[]),
    hasPermission(PERMISSIONS.INSPECTION_EDIT),
  ]);

  // 同料號跨倉庫多筆 = 跨店庫存。彙整成 group by item_code 給 board。
  const balanceRows: BalanceRow[] = balance.rows;

  return (
    <QuickQuoteBoard
      vehicle={vehicle}
      packages={packages}
      laborRates={laborRates}
      balanceRows={balanceRows}
      pendingItems={pendingItems}
      canEdit={canEdit}
    />
  );
}

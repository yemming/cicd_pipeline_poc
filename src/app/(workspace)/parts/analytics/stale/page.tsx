import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  getStaleAnalyticsPageData,
  getStaleInventoryStats,
  getStaleByAgeBucket,
  getStaleByWarehouseAge,
  listWarehouseLookup,
} from "@/domain/parts-analytics-stale";

import { StaleBoard } from "./_components/stale-board";

export const dynamic = "force-dynamic";

export default async function StaleAnalyticsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視呆滯庫存報表的權限</p>
      </main>
    );
  }

  let payload:
    | {
        overview: Awaited<ReturnType<typeof getStaleAnalyticsPageData>>["overview"];
        rows: Awaited<ReturnType<typeof getStaleAnalyticsPageData>>["rows"];
        kpiStats: Awaited<ReturnType<typeof getStaleInventoryStats>>;
        ageBuckets: Awaited<ReturnType<typeof getStaleByAgeBucket>>;
        whHeatCells: Awaited<ReturnType<typeof getStaleByWarehouseAge>>;
        warehouses: Awaited<ReturnType<typeof listWarehouseLookup>>;
      }
    | null = null;
  let loadError: string | null = null;

  try {
    const [page, kpiStats, ageBuckets, whHeatCells, warehouses] = await Promise.all([
      getStaleAnalyticsPageData(),
      getStaleInventoryStats(),
      getStaleByAgeBucket(),
      getStaleByWarehouseAge(),
      listWarehouseLookup(),
    ]);
    payload = {
      overview: page.overview,
      rows: page.rows,
      kpiStats,
      ageBuckets,
      whHeatCells,
      warehouses,
    };
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  if (loadError || !payload) {
    return (
      <main className="px-6 py-6 space-y-3">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          報表：呆滯庫存佔比
        </h1>
        <div className="bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] rounded-md px-3 py-2 text-[12.5px]">
          載入失敗：{loadError ?? "未知錯誤"}
        </div>
      </main>
    );
  }

  return (
    <StaleBoard
      overview={payload.overview}
      rows={payload.rows}
      kpiStats={payload.kpiStats}
      ageBuckets={payload.ageBuckets}
      whHeatCells={payload.whHeatCells}
      warehouses={payload.warehouses}
    />
  );
}

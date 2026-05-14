import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCountAdjustmentsPageData } from "@/domain/count";

import { CountAdjustmentsBoard } from "./_components/count-adjustments-board";

export const dynamic = "force-dynamic";

export default async function CountAdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    warehouse_id?: string;
    q?: string;
    variance_only?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.COUNT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視盤點差異的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  // 預設 variance_only = true（只有當 ?variance_only=0 時才包含無差異單）
  const varianceOnly = sp.variance_only !== "0";

  const { rows, warehouses, canEdit } = await getCountAdjustmentsPageData({
    status: sp.status || undefined,
    warehouse_id: sp.warehouse_id || undefined,
    q: sp.q || undefined,
    variance_only: varianceOnly,
  });

  return (
    <CountAdjustmentsBoard
      rows={rows}
      warehouses={warehouses}
      canEdit={canEdit}
      initialStatus={sp.status ?? ""}
      initialWarehouseId={sp.warehouse_id ?? ""}
      initialQ={sp.q ?? ""}
      initialVarianceOnly={varianceOnly}
    />
  );
}

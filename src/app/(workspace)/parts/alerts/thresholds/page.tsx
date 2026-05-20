import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getThresholdsPageData } from "@/domain/alerts";
import { getThresholdStats } from "@/domain/parts-thresholds";

import { ThresholdsBoard } from "./_components/thresholds-board";

export const dynamic = "force-dynamic";

export default async function ThresholdsPage({
  searchParams,
}: {
  searchParams: Promise<{
    abc_class?: string;
    q?: string;
    warehouse_id?: string;
    priority?: string;
    is_active?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ALERT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視水位設定的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const isActiveFilter =
    sp.is_active === "true" ? true : sp.is_active === "false" ? false : undefined;

  const [{ rows, warehouses, canEdit }, stats] = await Promise.all([
    getThresholdsPageData({
      abc_class: sp.abc_class || undefined,
      q: sp.q || undefined,
      warehouse_id: sp.warehouse_id || undefined,
      priority: sp.priority || undefined,
      is_active: isActiveFilter,
    }),
    getThresholdStats(),
  ]);

  return (
    <ThresholdsBoard
      rows={rows}
      warehouses={warehouses}
      canEdit={canEdit}
      stats={stats}
      initialAbc={sp.abc_class ?? ""}
      initialQ={sp.q ?? ""}
      initialWarehouseId={sp.warehouse_id ?? ""}
      initialPriority={sp.priority ?? ""}
      initialIsActive={sp.is_active ?? ""}
    />
  );
}

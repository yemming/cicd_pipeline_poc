import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCountPlansPageData } from "@/domain/count";

import { CountPlansBoard } from "./_components/count-plans-board";

export const dynamic = "force-dynamic";

export default async function CountPlansPage({
  searchParams,
}: {
  searchParams: Promise<{
    is_active?: string;
    q?: string;
    warehouse_id?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.COUNT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視盤點計畫的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const isActive =
    sp.is_active === "true" ? true : sp.is_active === "false" ? false : undefined;

  const { rows, warehouses, canEdit } = await getCountPlansPageData({
    is_active: isActive,
    q: sp.q || undefined,
    warehouse_id: sp.warehouse_id || undefined,
  });

  return (
    <CountPlansBoard
      rows={rows}
      warehouses={warehouses}
      canEdit={canEdit}
      initialIsActive={sp.is_active ?? ""}
      initialQ={sp.q ?? ""}
      initialWarehouseId={sp.warehouse_id ?? ""}
    />
  );
}

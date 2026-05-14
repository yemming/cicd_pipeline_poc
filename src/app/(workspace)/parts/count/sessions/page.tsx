import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCountSessionsPageData } from "@/domain/count";

import { CountSessionsBoard } from "./_components/count-sessions-board";

export const dynamic = "force-dynamic";

export default async function CountSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; warehouse_id?: string; q?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.COUNT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視盤點處理的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const { rows, warehouses, canEdit } = await getCountSessionsPageData({
    status: sp.status || undefined,
    warehouse_id: sp.warehouse_id || undefined,
    q: sp.q || undefined,
  });

  return (
    <CountSessionsBoard
      rows={rows}
      warehouses={warehouses}
      canEdit={canEdit}
      initialStatus={sp.status ?? ""}
      initialWarehouseId={sp.warehouse_id ?? ""}
      initialQ={sp.q ?? ""}
    />
  );
}

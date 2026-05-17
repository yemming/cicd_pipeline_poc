import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getIssuesPageData } from "@/domain/issues";

import { RepairPickBoard } from "./_components/repair-pick-board";

export const dynamic = "force-dynamic";

export default async function RepairPickPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; warehouse_id?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ISSUE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視領料單的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const { rows, canEdit, warehouses } = await getIssuesPageData({
    type: "ro_picking",
    status: sp.status || undefined,
    q: sp.q || undefined,
    warehouse_id: sp.warehouse_id || undefined,
  });

  return (
    <RepairPickBoard
      rows={rows}
      canEdit={canEdit}
      warehouses={warehouses}
      initialStatus={sp.status ?? ""}
      initialQ={sp.q ?? ""}
      initialWarehouse={sp.warehouse_id ?? ""}
    />
  );
}

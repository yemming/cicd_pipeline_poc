import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCountOpsPageData } from "@/domain/count";

import { CountOpsBoard } from "./_components/count-ops-board";

export const dynamic = "force-dynamic";

type StatusFilter = "all" | "active" | "pending_approval" | "completed";
const STATUS_FILTERS: readonly StatusFilter[] = [
  "all",
  "active",
  "pending_approval",
  "completed",
] as const;

function parseStatus(v?: string): StatusFilter {
  return (STATUS_FILTERS as readonly string[]).includes(v ?? "")
    ? (v as StatusFilter)
    : "all";
}

export default async function CountOpsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    warehouse_id?: string;
    q?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.COUNT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視盤點作業的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const status = parseStatus(sp.status);

  const { rows, stats, warehouses, canEdit } = await getCountOpsPageData({
    status,
    warehouse_id: sp.warehouse_id || undefined,
    q: sp.q || undefined,
  });

  return (
    <CountOpsBoard
      rows={rows}
      stats={stats}
      warehouses={warehouses}
      canEdit={canEdit}
      initialStatus={status}
      initialWarehouseId={sp.warehouse_id ?? ""}
      initialQ={sp.q ?? ""}
    />
  );
}

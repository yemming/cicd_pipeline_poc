import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getLossOverflowPageData,
  type LossOverflowFilters,
} from "@/domain/loss-overflow";

import { LossOverflowBoard } from "./_components/loss-overflow-board";

export const dynamic = "force-dynamic";

export default async function LossOverflowPage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    reason?: string;
    status?: string;
    warehouse_id?: string;
    date_from?: string;
    date_to?: string;
    amount_min?: string;
    amount_max?: string;
    q?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.COUNT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視報損報溢的權限</p>
      </main>
    );
  }

  const sp = await searchParams;

  const filters: LossOverflowFilters = {
    kind:
      sp.kind === "loss" || sp.kind === "overflow" ? sp.kind : "",
    reason: sp.reason || undefined,
    status: sp.status || undefined,
    warehouse_id: sp.warehouse_id || undefined,
    date_from: sp.date_from || undefined,
    date_to: sp.date_to || undefined,
    amount_min: sp.amount_min ? Number(sp.amount_min) : undefined,
    amount_max: sp.amount_max ? Number(sp.amount_max) : undefined,
    q: sp.q || undefined,
  };

  const {
    rows,
    warehouses,
    analytics,
    reasonBreakdown,
    trend,
    canEdit,
    canApprove,
  } = await getLossOverflowPageData(filters);

  return (
    <LossOverflowBoard
      rows={rows}
      warehouses={warehouses}
      analytics={analytics}
      reasonBreakdown={reasonBreakdown}
      trend={trend}
      canEdit={canEdit}
      canApprove={canApprove}
      initialFilters={{
        kind: sp.kind ?? "",
        reason: sp.reason ?? "",
        status: sp.status ?? "",
        warehouse_id: sp.warehouse_id ?? "",
        date_from: sp.date_from ?? "",
        date_to: sp.date_to ?? "",
        amount_min: sp.amount_min ?? "",
        amount_max: sp.amount_max ?? "",
        q: sp.q ?? "",
      }}
    />
  );
}

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  getReplenishmentKpis,
  getRunDetail,
  listReplenishmentRuns,
} from "@/domain/parts-replenishment";
import type { RunListStatus } from "@/domain/parts-replenishment.constants";

import { ReplenishmentBoard } from "./_components/replenishment-board";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set<RunListStatus>([
  "open",
  "approved",
  "rejected",
  "partially_converted",
  "converted",
]);

export default async function ReplenishmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PR_VIEW))) {
    return (
      <main className="px-6 py-5">
        <p className="text-[13px] text-[#CC0000]">沒有檢視日常補貨計畫的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const statusRaw = typeof sp.status === "string" ? sp.status : "all";
  const status: RunListStatus | "all" =
    statusRaw === "all" || VALID_STATUSES.has(statusRaw as RunListStatus)
      ? (statusRaw as RunListStatus | "all")
      : "all";
  const warehouseId = typeof sp.warehouseId === "string" ? sp.warehouseId : "all";
  const month = typeof sp.month === "string" ? sp.month : "";
  const runId = typeof sp.runId === "string" ? sp.runId : null;

  const [{ runs, warehouses }, kpis, detail, canRun, canCreatePO] = await Promise.all([
    listReplenishmentRuns({
      status,
      warehouseId,
      month,
    }),
    getReplenishmentKpis(),
    runId ? getRunDetail(runId) : Promise.resolve(null),
    hasPermission(PERMISSIONS.REPLENISHMENT_RUN),
    hasPermission(PERMISSIONS.PO_CREATE),
  ]);

  return (
    <ReplenishmentBoard
      runs={runs}
      warehouses={warehouses}
      kpis={kpis}
      filters={{
        status: status as string,
        warehouseId,
        month,
      }}
      selectedRunId={runId}
      selectedRunDetail={detail}
      canRun={canRun}
      canCreatePO={canCreatePO}
    />
  );
}

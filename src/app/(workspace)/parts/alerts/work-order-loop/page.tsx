import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getLoopBoardData, type LoopFilter } from "@/domain/parts-alert-work-order-loop";
import type { LoopStageKey } from "@/domain/parts-alert-work-order-loop.constants";

import { WorkorderLoopBoard } from "./_components/workorder-loop-board";

export const dynamic = "force-dynamic";

const ALLOWED_STAGES = new Set<LoopStageKey>([
  "sa_picking",
  "shortage_alert",
  "auto_demand",
  "po_review",
  "part_arrived",
  "auto_closed",
]);

export default async function WorkOrderLoopPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    overdue_only?: string;
    stage?: string;
    sa_name?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ALERT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視工單增項閉環的權限</p>
      </main>
    );
  }

  const sp = (await searchParams) ?? {};
  const statusFilter = ["pending", "escalated", "resolved"].includes(sp.status ?? "")
    ? (sp.status as "pending" | "escalated" | "resolved")
    : "";
  const stageFilter =
    sp.stage && ALLOWED_STAGES.has(sp.stage as LoopStageKey) ? (sp.stage as LoopStageKey) : "";

  const filter: LoopFilter = {
    q: sp.q || undefined,
    status: statusFilter || undefined,
    overdue_only: sp.overdue_only === "true",
    stage: stageFilter || undefined,
    sa_name: sp.sa_name || undefined,
  };

  let rows: Awaited<ReturnType<typeof getLoopBoardData>>["rows"] = [];
  let kpi = {
    open_count: 0,
    overdue_count: 0,
    resolved_count: 0,
    total_count: 0,
    avg_cycle_days: 0,
    avg_open_days: 0,
  };
  let stages: Awaited<ReturnType<typeof getLoopBoardData>>["stages"] = [];
  let funnel: Awaited<ReturnType<typeof getLoopBoardData>>["funnel"] = [];
  let saOptions: string[] = [];
  let canEdit = false;
  let errorMsg: string | null = null;

  try {
    const data = await getLoopBoardData(filter);
    rows = data.rows;
    kpi = data.kpi;
    stages = data.stages;
    funnel = data.funnel;
    saOptions = data.sa_options;
    canEdit = data.canEdit;
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "未知錯誤";
  }

  return (
    <WorkorderLoopBoard
      rows={rows}
      kpi={kpi}
      stages={stages}
      funnel={funnel}
      saOptions={saOptions}
      canEdit={canEdit}
      errorMsg={errorMsg}
      initialQ={sp.q ?? ""}
      initialStatus={statusFilter}
      initialOverdue={sp.overdue_only ?? ""}
      initialStage={stageFilter}
      initialSa={sp.sa_name ?? ""}
    />
  );
}

/**
 * 售後電訪工作檯 List Page
 *
 * Thin re-export：directly reuse sales 版的 CallTasksBoard，
 * 只是 basePath 換成 /aftersales/...、kind 鎖死 'aftersales'。
 *
 * Schema 共用同一張 call_tasks 表（kind = 'sales' | 'aftersales'）。
 */

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getCallTaskListPageData,
  getCallTaskLookups,
  type CallTaskFilters,
} from "@/domain/sales-call-tasks";
import type { SurveyKind } from "@/domain/sales-survey-templates";

import { CallTasksBoard } from "../../sales/call-tasks/_components/call-tasks-board";

export const dynamic = "force-dynamic";

const BASE_PATH = "/crm/aftersales/call-tasks";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視電訪工作檯的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const sp = await searchParams;
  // aftersales 路徑下 kind 鎖死 aftersales
  const kind: SurveyKind = "aftersales";
  const filters: CallTaskFilters = {
    kind,
    status: sp.status ?? "all",
    assignee: sp.assignee ?? "all",
    range: sp.range ?? "all",
    q: sp.q ?? "",
  };
  const [{ rows, totalCount }, lookups] = await Promise.all([
    getCallTaskListPageData(filters, userId),
    getCallTaskLookups(kind),
  ]);
  return (
    <CallTasksBoard
      rows={rows}
      totalCount={totalCount}
      canEdit={canEdit}
      filters={filters}
      currentUserId={userId}
      surveys={lookups.surveys}
      basePath={BASE_PATH}
    />
  );
}

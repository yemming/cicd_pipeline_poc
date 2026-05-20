/**
 * 售後電訪工作台 List Page（CRM03B）
 *
 * Thin re-export：reuse sales 版的 CallTasksBoard、basePath 換 /aftersales/...、
 * kind 鎖死 'aftersales'。
 *
 * Schema 共用同一張 call_tasks 表（kind = 'sales' | 'aftersales'）。
 */

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getAftersalesCallTaskInsights,
  getCallTaskBoardData,
  getCallTaskHistoryByCustomerIds,
  getNearestCallTaskDate,
} from "@/domain/sales-call-tasks";
import type {
  CallTaskBoardFilters,
  CallTaskBoardRange,
  SurveyKind,
} from "@/domain/sales-call-tasks.constants";
import {
  RESULT_LABEL,
  CALL_TYPE_SHORT_LABEL,
} from "@/domain/sales-call-tasks.constants";

import { AftersalesCallTasksBoard } from "./_components/aftersales-call-tasks-board";

export const dynamic = "force-dynamic";

const BASE_PATH = "/crm/aftersales/call-tasks";

function todayIso(): string {
  const now = new Date();
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return taipei.toISOString().slice(0, 10);
}

function parseRange(v: string | undefined): CallTaskBoardRange {
  return v === "7d" || v === "week" || v === "month" ? v : "1d";
}

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
        <p className="text-[14px] text-[#BF2600]">沒有檢視電訪工作台的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const sp = await searchParams;
  const kind: SurveyKind = "aftersales";
  const range = parseRange(sp.range);
  const today = todayIso();

  // user 沒明指日期 + range='1d'：fallback 到最近一個有任務的日期，避免空畫面
  let resolvedDate: string;
  if (/^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "")) {
    resolvedDate = sp.date!;
  } else if (range === "1d") {
    const nearest = await getNearestCallTaskDate(kind);
    resolvedDate = nearest ?? today;
  } else {
    resolvedDate = today;
  }

  const filters: CallTaskBoardFilters = {
    kind,
    date: resolvedDate,
    range,
    status: sp.status ?? "all",
    call_type: sp.call_type ?? "all",
    assignee: sp.assignee ?? "all",
  };
  const [{ rows, kpi, by_call_type, date_total, range_label }, insights] =
    await Promise.all([
      getCallTaskBoardData(filters, userId),
      getAftersalesCallTaskInsights(),
    ]);

  const customerIds = Array.from(
    new Set(rows.map((r) => r.customer_id).filter(Boolean)),
  );
  const excludeTaskIds = rows.map((r) => r.id);
  const historyRaw = await getCallTaskHistoryByCustomerIds(
    customerIds,
    excludeTaskIds,
    5,
  );
  const historyMap: Record<
    string,
    { date: string; result: string; note?: string; tone?: "teal" | "blue" | "amber" | "red" | "gray" }[]
  > = {};
  for (const [cid, entries] of Object.entries(historyRaw)) {
    historyMap[cid] = entries.map((e) => {
      const tone =
        e.call_result === "answered"
          ? ("teal" as const)
          : e.call_result === "callback_later"
            ? ("blue" as const)
            : e.call_result === "no_answer"
              ? ("amber" as const)
              : e.call_result === "refused" || e.call_result === "wrong_number"
                ? ("red" as const)
                : ("gray" as const);
      const typeLabel = e.call_type ? `[${CALL_TYPE_SHORT_LABEL[e.call_type]}] ` : "";
      const resultLabel = e.call_result ? RESULT_LABEL[e.call_result] : e.status;
      return {
        date: e.date,
        result: `${typeLabel}${resultLabel}`,
        note: e.notes ?? undefined,
        tone,
      };
    });
  }

  return (
    <AftersalesCallTasksBoard
      rows={rows}
      kpi={kpi}
      byCallType={by_call_type}
      dateTotal={date_total}
      canEdit={canEdit}
      filters={filters}
      currentUserId={userId}
      historyMap={historyMap}
      basePath={BASE_PATH}
      rangeLabel={range_label}
      insights={insights}
    />
  );
}

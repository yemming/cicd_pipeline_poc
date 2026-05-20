/**
 * 售後休眠流失管理 · /crm/aftersales/dormant-customers · M02-6
 *
 * 升 A 級：KpiCard + Tab 雙 list + DonutChart + design tokens。
 * 資料源：customers.aftersales_dormancy_status (typed) + work_orders runtime 推 days_overdue。
 */

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listAftersalesDormantCustomers,
  listAftersalesSaAssignees,
  type AftersalesDormancyStatus,
  type AftersalesLostReason,
} from "@/domain/crm-aftersales-dormant";

import { AftersalesDormantBoard } from "./_components/aftersales-dormant-board";

export const dynamic = "force-dynamic";

type Tab = "dormant" | "lost";

const DORMANCY_VALUES: AftersalesDormancyStatus[] = [
  "active",
  "dormant_60",
  "dormant_120",
  "dormant_180",
  "lost",
];
const REASON_VALUES: AftersalesLostReason[] = [
  "maintenance_overdue",
  "low_nps",
  "warranty_expired",
  "desmo_overdue",
  "unreachable",
  "other",
];

function parseTab(s: string | undefined): Tab {
  return s === "lost" ? "lost" : "dormant";
}

function parseStatusFilter(
  s: string | undefined,
): AftersalesDormancyStatus | "all" {
  if (!s) return "all";
  return (DORMANCY_VALUES as string[]).includes(s)
    ? (s as AftersalesDormancyStatus)
    : "all";
}

function parseReasonFilter(s: string | undefined): AftersalesLostReason | "all" {
  if (!s) return "all";
  return (REASON_VALUES as string[]).includes(s)
    ? (s as AftersalesLostReason)
    : "all";
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
        <p className="text-[14px] text-[#BF2600]">沒有檢視休眠流失管理的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const sp = await searchParams;
  const tab = parseTab(sp.tab);

  // 撈 dormant + lost 全集 KPI 一次取出
  const [{ rows: allRows, kpi }, saOptions] = await Promise.all([
    listAftersalesDormantCustomers({}),
    listAftersalesSaAssignees(),
  ]);

  // 套 page 層 tab + filter（讓 board 只負責 KPI 顯示全集 + tab 切換的列表）
  const statusFilter = parseStatusFilter(sp.status);
  const reasonFilter = parseReasonFilter(sp.reason);
  const search = (sp.search ?? "").trim();
  const searchU = search.toUpperCase();

  let rows = allRows;
  // Tab 分流
  if (tab === "dormant") {
    rows = rows.filter((r) => r.dormancy_status !== "lost");
  } else {
    rows = rows.filter((r) => r.dormancy_status === "lost");
  }
  // status filter（僅 dormant tab）
  if (tab === "dormant" && statusFilter !== "all") {
    rows = rows.filter((r) => r.dormancy_status === statusFilter);
  }
  // reason filter（僅 lost tab）
  if (tab === "lost" && reasonFilter !== "all") {
    rows = rows.filter((r) => r.lost_reason === reasonFilter);
  }
  // search（兩個 tab 共用）
  if (search) {
    rows = rows.filter(
      (r) =>
        r.code.toUpperCase().includes(searchU) ||
        r.name.toUpperCase().includes(searchU) ||
        (r.phone ?? "").toUpperCase().includes(searchU) ||
        (r.primary_license_plate ?? "").toUpperCase().includes(searchU),
    );
  }
  // chartSlot 在 lost tab 顯示流失原因分佈 — donut 用 lost 全集（不被 filter 影響）
  const lostAll = allRows.filter((r) => r.dormancy_status === "lost");

  return (
    <AftersalesDormantBoard
      rows={rows}
      lostAll={lostAll}
      kpi={kpi}
      saOptions={saOptions}
      canEdit={canEdit}
      currentTab={tab}
      filters={{
        status: statusFilter,
        reason: reasonFilter,
        search,
      }}
    />
  );
}

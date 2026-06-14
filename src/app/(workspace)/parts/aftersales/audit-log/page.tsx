import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listAftersalesAudit } from "@/domain/audit-logs";
import { AUDIT_LOG_PAGE_SIZE } from "@/domain/audit-logs.constants";

import { AftersalesAuditBoard } from "./_components/aftersales-audit-board";

export const dynamic = "force-dynamic";

export default async function AftersalesAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.AUDIT_AFTERSALES_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視售後稽核日誌的權限（需要：售後主管或店長）</p>
      </main>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const filters = {
    action: sp.action || "all",
    table_name: sp.table_name || "all",
    date_from: sp.date_from || "",
    date_to: sp.date_to || "",
  };

  const { rows, totalCount } = await listAftersalesAudit(
    {
      action: filters.action !== "all" ? filters.action : undefined,
      table_name: filters.table_name !== "all" ? filters.table_name : undefined,
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
    },
    page,
    AUDIT_LOG_PAGE_SIZE,
  );

  return (
    <AftersalesAuditBoard
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={AUDIT_LOG_PAGE_SIZE}
      filters={filters}
    />
  );
}

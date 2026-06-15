import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listGroupAudit,
  listGroupAnomalySummary,
  listBrandsForAudit,
} from "@/domain/audit-logs";
import { AUDIT_LOG_PAGE_SIZE } from "@/domain/audit-logs.constants";

import { GroupAuditBoard } from "./_components/group-audit-board";

export const dynamic = "force-dynamic";

export default async function GroupAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.AUDIT_GROUP_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視集團稽核日誌的權限（需要：集團管理員）</p>
      </main>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const filters = {
    brand_id: sp.brand_id || "all",
    action: sp.action || "all",
    keyword: sp.keyword || "",
    date_from: sp.date_from || "",
    date_to: sp.date_to || "",
  };

  const [{ rows, totalCount }, anomalySummary, brandOptions] = await Promise.all([
    listGroupAudit(
      {
        brand_id: filters.brand_id !== "all" ? filters.brand_id : undefined,
        action: filters.action !== "all" ? filters.action : undefined,
        keyword: filters.keyword || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
      },
      page,
      AUDIT_LOG_PAGE_SIZE,
    ),
    listGroupAnomalySummary(),
    listBrandsForAudit(),
  ]);

  return (
    <GroupAuditBoard
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={AUDIT_LOG_PAGE_SIZE}
      filters={filters}
      anomalySummary={anomalySummary}
      brandOptions={brandOptions}
    />
  );
}

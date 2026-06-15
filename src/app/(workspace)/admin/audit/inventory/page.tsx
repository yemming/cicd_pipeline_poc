import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { listInventoryAudit, listInventoryAuditStats } from "@/domain/audit-logs";
import { AUDIT_LOG_PAGE_SIZE } from "@/domain/audit-logs.constants";

import { InventoryAuditBoard } from "./_components/inventory-audit-board";

export const dynamic = "force-dynamic";

export default async function InventoryAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.AUDIT_INVENTORY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視庫存稽核日誌的權限（需要：倉管主管或管理員）</p>
      </main>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const filters = {
    action: sp.action || "all",
    keyword: sp.keyword || "",
    date_from: sp.date_from || "",
    date_to: sp.date_to || "",
  };

  const scope = await getActiveScope();
  const brandId = scope.brand_id;

  const [{ rows, totalCount }, auditStats] = await Promise.all([
    listInventoryAudit(
      {
        brand_id: brandId,
        action: filters.action !== "all" ? filters.action : undefined,
        keyword: filters.keyword || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
      },
      page,
      AUDIT_LOG_PAGE_SIZE,
    ),
    listInventoryAuditStats(brandId),
  ]);

  return (
    <InventoryAuditBoard
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={AUDIT_LOG_PAGE_SIZE}
      filters={filters}
      auditStats={auditStats}
    />
  );
}

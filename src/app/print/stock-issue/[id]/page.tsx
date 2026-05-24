import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getIssueForPrint } from "@/domain/issues";

import { StockIssuePrintable } from "./_components/stock-issue-printable";

export const dynamic = "force-dynamic";

/**
 * 領料單 / 出庫單列印頁 — 不在 (workspace) group 底下，所以沒有 topbar / sidebar。
 * 通用 cover ro_picking / internal_sale / transfer_out 三種 stock_issues.type。
 */
export default async function StockIssuePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ISSUE_VIEW))) {
    return (
      <main style={{ padding: "32px", color: "#CC0000", fontSize: "14px" }}>
        沒有列印領料單的權限
      </main>
    );
  }

  const { id } = await params;
  const data = await getIssueForPrint(id);
  if (!data) notFound();

  return <StockIssuePrintable data={data} />;
}

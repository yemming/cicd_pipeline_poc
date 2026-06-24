import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listDiscountApprovals,
  getDiscountApprovalQueueKpis,
} from "@/domain/discount-approvals";
import { DiscountApprovalsBoard } from "./_components/discount-approvals-board";

/**
 * /admin/approvals/discount — 折扣審核佇列（RS_M5）
 *
 * Server component：撈待審核列表 + KPIs 傳給 client board。
 */
export default async function DiscountApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const canApprove = await hasPermission(PERMISSIONS.SALES_ORDER_APPROVE);

  const filterStatus = (sp.status as string) ?? "";
  const filterInStoreOnly = sp.in_store_only === "1";
  const page = Math.max(1, parseInt((sp.page as string) ?? "1", 10));
  const pageSize = 50;

  const [listRes, kpis] = await Promise.all([
    listDiscountApprovals({
      status: filterStatus || undefined,
      in_store_waiting: filterInStoreOnly ? true : undefined,
      page,
      pageSize,
    }),
    getDiscountApprovalQueueKpis(),
  ]);

  return (
    <DiscountApprovalsBoard
      rows={listRes.rows}
      totalCount={listRes.totalCount}
      page={page}
      pageSize={pageSize}
      kpis={kpis}
      filterStatus={filterStatus}
      filterInStoreOnly={filterInStoreOnly}
      canApprove={canApprove}
    />
  );
}

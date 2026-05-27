/**
 * RS_INV03 整車採購財務結算 — 列表
 *
 * 整車供應鏈財務段：到港後輸入關稅 / 運費 / 保險，按採購成本比例分攤回每台整車成本。
 * 只列「已到港（底下有車輛）」的採購單，分待結算 / 已結算兩態。
 */

import {
  listSettlementPurchaseOrders,
  COST_SETTLEMENT_PAGE_SIZE_DEFAULT,
} from "@/domain/cost-settlement";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import CostSettlementBoard from "./_components/cost-settlement-board";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "整車採購財務結算 | DealerOS",
};

export default async function CostSettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">請先登入</main>;
  }
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_VIEW))) {
    return (
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">無權限檢視財務結算</main>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = COST_SETTLEMENT_PAGE_SIZE_DEFAULT;
  const filters = { status: sp.status ?? "all", q: sp.q ?? "" };

  const [{ rows, totalCount }, canEdit] = await Promise.all([
    listSettlementPurchaseOrders(filters, { page, pageSize }),
    hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
  ]);

  return (
    <CostSettlementBoard
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      canEdit={canEdit}
      filters={filters}
    />
  );
}

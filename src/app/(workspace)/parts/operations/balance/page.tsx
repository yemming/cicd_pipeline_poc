import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getStockBalancePageData } from "@/domain/stock";
import { BALANCE_PAGE_SIZE_DEFAULT } from "@/domain/stock.constants";

import { StockBalanceBoard } from "./_components/stock-balance-board";

export const dynamic = "force-dynamic";

export default async function StockBalancePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    warehouse?: string;
    control?: string;
    status?: string;
    include_zero?: string;
    page?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視庫存的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = BALANCE_PAGE_SIZE_DEFAULT;
  const { rows, totalCount, warehouses } = await getStockBalancePageData(
    {
      q: sp.q || undefined,
      warehouse_id: sp.warehouse || undefined,
      control_type: sp.control || undefined,
      status: sp.status || undefined,
      include_zero: sp.include_zero === "1",
    },
    { page, pageSize },
  );

  return (
    <StockBalanceBoard
      rows={rows}
      totalCount={totalCount}
      warehouses={warehouses}
      page={page}
      pageSize={pageSize}
      initialQ={sp.q ?? ""}
      initialWarehouse={sp.warehouse ?? ""}
      initialControl={sp.control ?? ""}
      initialStatus={sp.status ?? ""}
      initialIncludeZero={sp.include_zero === "1"}
    />
  );
}

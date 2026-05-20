import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getBalancePageData } from "@/domain/parts-balance";

import { BalanceBoard } from "./_components/balance-board";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function StockBalancePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    warehouse?: string;
    abc?: string;
    alert?: string;
    category?: string;
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

  const { rows, totalCount, stats, warehouses, categories, canReplenish } =
    await getBalancePageData(
      {
        q: sp.q || undefined,
        warehouse_id: sp.warehouse || undefined,
        abc_class: sp.abc || undefined,
        alert_level: sp.alert || undefined,
        category: sp.category || undefined,
        include_zero: sp.include_zero === "1",
      },
      { page, pageSize: PAGE_SIZE },
    );

  return (
    <BalanceBoard
      rows={rows}
      totalCount={totalCount}
      stats={stats}
      warehouses={warehouses}
      categories={categories}
      canReplenish={canReplenish}
      page={page}
      pageSize={PAGE_SIZE}
      initialQ={sp.q ?? ""}
      initialWarehouse={sp.warehouse ?? ""}
      initialAbc={sp.abc ?? ""}
      initialAlert={sp.alert ?? ""}
      initialCategory={sp.category ?? ""}
      initialIncludeZero={sp.include_zero === "1"}
    />
  );
}

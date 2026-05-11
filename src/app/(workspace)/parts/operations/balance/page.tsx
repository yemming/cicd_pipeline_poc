import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getStockBalancePageData } from "@/domain/stock";

import { StockBalanceBoard } from "./_components/stock-balance-board";

export const dynamic = "force-dynamic";

export default async function StockBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
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
  const { rows } = await getStockBalancePageData({ q: sp.q || undefined });

  return <StockBalanceBoard rows={rows} initialQ={sp.q ?? ""} />;
}

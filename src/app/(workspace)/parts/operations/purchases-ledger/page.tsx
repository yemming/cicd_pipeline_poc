import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listInventoryPurchases,
  type InventoryPurchaseFilters,
} from "@/domain/inventory-purchases";

import { PurchasesLedgerBoard } from "./_components/purchases-ledger-board";

export const dynamic = "force-dynamic";

export default async function PurchasesLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{
    date_from?: string;
    date_to?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視採購進貨成本記錄的權限</p>
      </main>
    );
  }

  const sp = await searchParams;

  const filters: InventoryPurchaseFilters = {
    date_from: sp.date_from || undefined,
    date_to: sp.date_to || undefined,
  };

  const { rows, totalCount } = await listInventoryPurchases(filters);

  return (
    <PurchasesLedgerBoard
      rows={rows}
      totalCount={totalCount}
      initialDateFrom={sp.date_from ?? ""}
      initialDateTo={sp.date_to ?? ""}
    />
  );
}

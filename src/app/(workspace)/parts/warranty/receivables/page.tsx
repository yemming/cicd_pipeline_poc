import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listWarrantyReceivables,
  type WarrantyReceivableFilters,
} from "@/domain/warranty-receivables";

import { ReceivablesBoard } from "./_components/receivables-board";

export const dynamic = "force-dynamic";

export default async function WarrantyReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.WARRANTY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視保固索賠應收款的權限</p>
      </main>
    );
  }

  const sp = await searchParams;

  const filters: WarrantyReceivableFilters = {
    status: sp.status || undefined,
  };

  const { rows, totalCount } = await listWarrantyReceivables(filters);

  return (
    <ReceivablesBoard
      rows={rows}
      totalCount={totalCount}
      initialStatus={sp.status ?? ""}
    />
  );
}

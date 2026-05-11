import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getContractsPageData,
  getSupplierOptions,
  type ContractStatus,
} from "@/domain/contracts";

import { ContractsBoard } from "./_components/contracts-board";

export const dynamic = "force-dynamic";

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.SUPPLIER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視採購合約的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const filter = {
    status: (sp.status as ContractStatus | "all" | undefined) ?? "all",
    q: sp.q || undefined,
  };
  const [{ rows, kpis, canEdit }, supplierOptions] = await Promise.all([
    getContractsPageData(filter),
    getSupplierOptions(),
  ]);

  return (
    <ContractsBoard
      rows={rows}
      kpis={kpis}
      canEdit={canEdit}
      supplierOptions={supplierOptions}
      initialStatus={sp.status ?? "all"}
      initialQ={sp.q ?? ""}
    />
  );
}

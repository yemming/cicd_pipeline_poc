import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getSuppliersPageData,
  type ContractStatus,
} from "@/domain/suppliers";

import { SuppliersBoard } from "./_components/suppliers-board";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    contract_status?: string;
    q?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.SUPPLIER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視供應商的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const filter = {
    type: sp.type || undefined,
    contract_status: (sp.contract_status as ContractStatus | "all" | undefined) ?? "all",
    q: sp.q || undefined,
  };
  const { rows, canEdit } = await getSuppliersPageData(filter);

  return (
    <SuppliersBoard
      rows={rows}
      canEdit={canEdit}
      initialType={sp.type ?? ""}
      initialContractStatus={sp.contract_status ?? "all"}
      initialQ={sp.q ?? ""}
    />
  );
}

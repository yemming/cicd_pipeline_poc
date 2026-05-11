import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getContractById,
  getContractHistory,
  getSupplierOptions,
} from "@/domain/contracts";

import { ContractDetailView } from "./_components/contract-detail-view";

export const dynamic = "force-dynamic";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  const { id } = await params;
  const contract = await getContractById(id);
  if (!contract) notFound();

  // baseNo: 封存過的 row 從 metadata.base_contract_no 取；否則 = 自己的 contract_no
  const meta = (contract.metadata ?? {}) as Record<string, unknown>;
  const baseNo =
    (typeof meta.base_contract_no === "string" ? meta.base_contract_no : null) ??
    contract.contract_no ??
    "";
  const [history, supplierOptions, canEdit] = await Promise.all([
    contract.supplier_id && baseNo
      ? getContractHistory(contract.supplier_id, baseNo)
      : Promise.resolve([]),
    getSupplierOptions(),
    hasPermission(PERMISSIONS.SUPPLIER_EDIT),
  ]);

  return (
    <ContractDetailView
      contract={contract}
      history={history}
      supplierOptions={supplierOptions}
      canEdit={canEdit}
      initialMode="view"
    />
  );
}

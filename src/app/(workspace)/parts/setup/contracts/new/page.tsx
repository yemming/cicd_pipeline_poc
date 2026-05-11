import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSupplierOptions } from "@/domain/contracts";

import { ContractDetailView } from "../[id]/_components/contract-detail-view";

export const dynamic = "force-dynamic";

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier_id?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.SUPPLIER_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有建立採購合約的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const supplierOptions = await getSupplierOptions();

  // 強制要先選 supplier；沒帶 supplier_id 就導回列表
  if (!sp.supplier_id) {
    redirect("/parts/setup/contracts");
  }

  return (
    <ContractDetailView
      contract={null}
      history={[]}
      supplierOptions={supplierOptions}
      canEdit
      initialMode="create"
      preselectedSupplierId={sp.supplier_id}
    />
  );
}

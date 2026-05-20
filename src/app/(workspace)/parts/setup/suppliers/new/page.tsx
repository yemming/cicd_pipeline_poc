import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSupplierLookups } from "@/domain/suppliers";

import { SupplierDetailView } from "../[id]/_components/supplier-detail-view";

export const dynamic = "force-dynamic";

export default async function NewSupplierPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.SUPPLIER_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有新增供應商的權限</p>
      </main>
    );
  }

  const lookups = await getSupplierLookups();

  return (
    <SupplierDetailView
      supplier={null}
      contracts={[]}
      metrics={null}
      coaOptions={lookups.coaOptions}
      taxCodeOptions={lookups.taxCodeOptions}
      canEdit={true}
      initialMode="create"
    />
  );
}

import { redirect } from "next/navigation";

import { listAccounts } from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { SupplierDetailView } from "../[id]/_components/supplier-detail-view";

export const dynamic = "force-dynamic";

export default async function NewSupplierPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.SUPPLIER_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立供應商的權限</p>
      </main>
    );
  }

  const accounts = await listAccounts({ l1Category: "LIABILITY" });

  return (
    <SupplierDetailView
      supplier={null}
      accounts={accounts}
      canEdit
      initialMode="create"
    />
  );
}

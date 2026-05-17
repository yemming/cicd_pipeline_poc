import { redirect } from "next/navigation";

import { listSuppliers } from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { SuppliersBoard } from "./_components/suppliers-board";

export const dynamic = "force-dynamic";

export default async function SuppliersAdminPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.SUPPLIER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視供應商的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.SUPPLIER_EDIT);
  const suppliers = await listSuppliers({ activeOnly: false });

  return <SuppliersBoard rows={suppliers} canEdit={canEdit} />;
}

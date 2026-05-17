import { notFound, redirect } from "next/navigation";

import {
  getSupplierById,
  listAccounts,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { SupplierDetailView } from "./_components/supplier-detail-view";

export const dynamic = "force-dynamic";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.SUPPLIER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視供應商的權限</p>
      </main>
    );
  }

  const [supplier, accounts] = await Promise.all([
    getSupplierById(id),
    listAccounts({ l1Category: "LIABILITY" }),
  ]);
  if (!supplier) notFound();

  const canEdit = await hasPermission(PERMISSIONS.SUPPLIER_EDIT);

  return (
    <SupplierDetailView
      supplier={supplier}
      accounts={accounts}
      canEdit={canEdit}
    />
  );
}

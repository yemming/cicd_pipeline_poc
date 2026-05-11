import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getSupplierById,
  getContractsBySupplierId,
  getSupplierLookups,
} from "@/domain/suppliers";

import { SupplierDetailView } from "./_components/supplier-detail-view";

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  const { id } = await params;
  const [supplier, lookups, canEdit] = await Promise.all([
    getSupplierById(id),
    getSupplierLookups(),
    hasPermission(PERMISSIONS.SUPPLIER_EDIT),
  ]);
  if (!supplier) notFound();

  const contracts = await getContractsBySupplierId(supplier.id);

  return (
    <SupplierDetailView
      supplier={supplier}
      contracts={contracts}
      coaOptions={lookups.coaOptions}
      taxCodeOptions={lookups.taxCodeOptions}
      canEdit={canEdit}
      initialMode="view"
    />
  );
}

import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSupplierPricingById } from "@/lib/master-data/queries";
import { listSupplierPricingLookups } from "@/domain/supplier-pricing";

import { SupplierPricingDetailView } from "./_components/supplier-pricing-detail-view";

export const dynamic = "force-dynamic";

export default async function SupplierPricingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.SUPPLIER_PRICING_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視供應商定價的權限</p>
      </main>
    );
  }

  const [pricing, lookups, canEdit] = await Promise.all([
    getSupplierPricingById(id),
    listSupplierPricingLookups({ activeOnly: false, itemLimit: 1000 }),
    hasPermission(PERMISSIONS.SUPPLIER_PRICING_EDIT),
  ]);
  if (!pricing) notFound();

  return (
    <SupplierPricingDetailView
      pricing={pricing}
      suppliers={lookups.suppliers}
      items={lookups.items}
      canEdit={canEdit}
    />
  );
}

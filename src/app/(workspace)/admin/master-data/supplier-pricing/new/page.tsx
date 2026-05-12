import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listSupplierPricingLookups } from "@/domain/supplier-pricing";

import { SupplierPricingDetailView } from "../[id]/_components/supplier-pricing-detail-view";

export const dynamic = "force-dynamic";

export default async function NewSupplierPricingPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.SUPPLIER_PRICING_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立供應商定價的權限</p>
      </main>
    );
  }

  const { suppliers, items } = await listSupplierPricingLookups({
    activeOnly: true,
    itemLimit: 1000,
  });

  return (
    <SupplierPricingDetailView
      pricing={null}
      suppliers={suppliers}
      items={items}
      canEdit
      initialMode="create"
    />
  );
}

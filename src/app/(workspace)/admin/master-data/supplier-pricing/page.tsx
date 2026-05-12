import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listSupplierPricingForAdmin } from "@/domain/supplier-pricing";

import {
  SupplierPricingBoard,
  type SupplierPricingFilters,
} from "./_components/supplier-pricing-board";

export const dynamic = "force-dynamic";

export default async function SupplierPricingListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.SUPPLIER_PRICING_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視供應商定價的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.SUPPLIER_PRICING_EDIT);
  const sp = await searchParams;
  const filters: SupplierPricingFilters = {
    supplier: sp.supplier ?? "all",
    item: sp.item ?? "all",
    primary: sp.primary ?? "all",
    status: sp.status ?? "all",
    q: sp.q ?? "",
  };
  const { rows, suppliers, items, totalCount } = await listSupplierPricingForAdmin(filters);

  return (
    <SupplierPricingBoard
      rows={rows}
      suppliers={suppliers}
      items={items}
      canEdit={canEdit}
      totalCount={totalCount}
      filters={filters}
    />
  );
}

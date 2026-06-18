import { redirect } from "next/navigation";

import {
  listCustomers,
  listRepairOrdersForWarranty,
  listWarrantyClaims,
  WARRANTY_CLAIMS_PAGE_SIZE_DEFAULT,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { WarrantyClaimsBoard } from "./_components/warranty-claims-board";

export const dynamic = "force-dynamic";

export default async function WarrantyClaimsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WARRANTY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視保固索賠的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = WARRANTY_CLAIMS_PAGE_SIZE_DEFAULT;

  const canEdit = await hasPermission(PERMISSIONS.WARRANTY_SUBMIT);
  const [claimsResult, customers, repairOrders] = await Promise.all([
    listWarrantyClaims({ page, pageSize }),
    listCustomers({ activeOnly: false, limit: 1000 }),
    listRepairOrdersForWarranty({ limit: 500 }),
  ]);

  return (
    <WarrantyClaimsBoard
      rows={claimsResult.rows}
      totalCount={claimsResult.totalCount}
      page={page}
      pageSize={pageSize}
      canEdit={canEdit}
      customers={customers.map((c) => ({ id: c.id, name: c.name }))}
      repairOrders={repairOrders.map((r) => ({ id: r.id, ro_code: r.ro_code }))}
    />
  );
}

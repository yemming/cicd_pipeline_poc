import { notFound, redirect } from "next/navigation";

import {
  getWarrantyClaimById,
  listCustomers,
  listItems,
  listRepairOrdersForWarranty,
  listVehicleModels,
  listWarrantyClaimLines,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { WarrantyClaimDetailView } from "./_components/warranty-claim-detail-view";

export const dynamic = "force-dynamic";

export default async function EditWarrantyClaimPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WARRANTY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視保固索賠的權限</p>
      </main>
    );
  }

  const [claim, customers, models, repairOrders, items] = await Promise.all([
    getWarrantyClaimById(id),
    listCustomers({ activeOnly: false, limit: 1000 }),
    listVehicleModels(),
    listRepairOrdersForWarranty({ limit: 500 }),
    listItems({ limit: 500 }),
  ]);
  if (!claim) notFound();

  const lines = await listWarrantyClaimLines(claim.id);

  const canEdit = await hasPermission(PERMISSIONS.WARRANTY_SUBMIT);

  return (
    <WarrantyClaimDetailView
      claim={claim}
      lines={lines}
      customers={customers}
      models={models}
      repairOrders={repairOrders}
      items={items}
      canEdit={canEdit}
    />
  );
}

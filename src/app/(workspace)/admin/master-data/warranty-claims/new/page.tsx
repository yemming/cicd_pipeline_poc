import { redirect } from "next/navigation";

import {
  listCustomers,
  listItems,
  listVehicleModels,
  listWorkOrders,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { WarrantyClaimDetailView } from "../[id]/_components/warranty-claim-detail-view";

export const dynamic = "force-dynamic";

export default async function NewWarrantyClaimPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WARRANTY_SUBMIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立保固索賠的權限</p>
      </main>
    );
  }

  const [customers, models, workOrders, items] = await Promise.all([
    listCustomers({ limit: 500 }),
    listVehicleModels(),
    listWorkOrders({ limit: 500 }),
    listItems({ limit: 500 }),
  ]);

  return (
    <WarrantyClaimDetailView
      claim={null}
      lines={[]}
      customers={customers}
      models={models}
      workOrders={workOrders}
      items={items}
      canEdit
      initialMode="create"
    />
  );
}

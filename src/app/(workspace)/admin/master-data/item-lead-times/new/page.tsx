import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listSupplierOptionsForLeadTime } from "@/domain/items";

import { ItemLeadTimeDetailView } from "../[id]/_components/item-lead-time-detail-view";

export const dynamic = "force-dynamic";

export default async function ItemLeadTimeNewPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立料號的權限</p>
      </main>
    );
  }

  const suppliers = await listSupplierOptionsForLeadTime();

  return (
    <ItemLeadTimeDetailView
      item={null}
      suppliers={suppliers}
      canEdit
      initialMode="create"
    />
  );
}

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getItemLeadTimeById,
  listSupplierOptionsForLeadTime,
} from "@/domain/items";

import { ItemLeadTimeDetailView } from "./_components/item-lead-time-detail-view";

export const dynamic = "force-dynamic";

export default async function ItemLeadTimeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視料號的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const [item, suppliers, canEdit] = await Promise.all([
    getItemLeadTimeById(id),
    listSupplierOptionsForLeadTime(),
    hasPermission(PERMISSIONS.ITEM_EDIT),
  ]);

  return (
    <ItemLeadTimeDetailView
      item={item}
      suppliers={suppliers}
      canEdit={canEdit}
      initialMode="view"
    />
  );
}

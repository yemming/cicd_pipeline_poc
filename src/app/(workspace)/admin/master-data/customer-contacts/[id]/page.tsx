import { redirect } from "next/navigation";

import {
  getCustomerContactById,
  listCustomers,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { CustomerContactDetailView } from "./_components/customer-contact-detail-view";

export const dynamic = "force-dynamic";

export default async function CustomerContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視客戶的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const [contact, customers] = await Promise.all([
    getCustomerContactById(id),
    listCustomers({ activeOnly: false, limit: 1000 }),
  ]);

  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);

  return (
    <CustomerContactDetailView
      contact={contact}
      customers={customers.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
      initialMode="view"
      canEdit={canEdit}
    />
  );
}

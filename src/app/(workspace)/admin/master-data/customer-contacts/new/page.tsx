import { redirect } from "next/navigation";

import { listCustomers } from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { CustomerContactDetailView } from "../[id]/_components/customer-contact-detail-view";

export const dynamic = "force-dynamic";

export default async function CustomerContactNewPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有編輯客戶的權限</p>
      </main>
    );
  }

  const customers = await listCustomers({ activeOnly: false, limit: 1000 });

  return (
    <CustomerContactDetailView
      contact={null}
      customers={customers.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
      initialMode="create"
      canEdit
    />
  );
}

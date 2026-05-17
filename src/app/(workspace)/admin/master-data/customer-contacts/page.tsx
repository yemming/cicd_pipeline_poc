import { redirect } from "next/navigation";

import {
  listCustomerContacts,
  listCustomers,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { CustomerContactsBoard } from "./_components/customer-contacts-board";

export const dynamic = "force-dynamic";

export default async function CustomerContactsListPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視客戶的權限</p>
      </main>
    );
  }

  const [contacts, customers] = await Promise.all([
    listCustomerContacts({ activeOnly: false }),
    listCustomers({ activeOnly: false, limit: 1000 }),
  ]);

  return (
    <CustomerContactsBoard
      rows={contacts}
      customers={customers.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
    />
  );
}

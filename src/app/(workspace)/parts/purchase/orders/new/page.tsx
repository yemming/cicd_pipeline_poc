import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getNewPOFormData } from "@/domain/orders";

import { NewPOForm } from "./_components/new-po-form";

export const dynamic = "force-dynamic";

export default async function NewPurchaseOrderPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.PO_CREATE))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有建立採購單的權限</p>
      </main>
    );
  }

  const { suppliers, warehouses, items } = await getNewPOFormData();

  return (
    <NewPOForm
      suppliers={suppliers}
      warehouses={warehouses}
      items={items}
    />
  );
}

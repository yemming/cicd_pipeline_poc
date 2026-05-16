import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCustomerTagsPageData } from "@/domain/customer-tags";

import { SalesCustomerTagsBoard } from "./_components/sales-customer-tags-board";

export const dynamic = "force-dynamic";

export default async function SalesCustomerTagsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視客戶標籤的權限</p>
      </main>
    );
  }

  const data = await getCustomerTagsPageData();

  return <SalesCustomerTagsBoard data={data} />;
}

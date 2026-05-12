import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getInternalSaleFormData } from "@/domain/issues";

import { NewInternalSaleForm } from "./_components/new-internal-sale-form";

export const dynamic = "force-dynamic";

export default async function NewInternalSalePage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ISSUE_CREATE))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有建立內售出貨單的權限</p>
      </main>
    );
  }
  const data = await getInternalSaleFormData();
  return <NewInternalSaleForm data={data} />;
}

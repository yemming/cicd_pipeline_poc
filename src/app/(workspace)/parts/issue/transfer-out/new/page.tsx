import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getNewTransferFormData } from "@/domain/transfers";

import { NewTransferOutForm } from "./_components/new-transfer-out-form";

export const dynamic = "force-dynamic";

export default async function NewTransferOutPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.TRANSFER_CREATE))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有建立調撥單的權限</p>
      </main>
    );
  }

  const data = await getNewTransferFormData();
  return <NewTransferOutForm data={data} />;
}

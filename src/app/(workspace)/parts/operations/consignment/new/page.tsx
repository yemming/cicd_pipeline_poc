import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getNewConsignmentFormData } from "@/domain/consignment";

import { NewConsignmentForm } from "./_components/new-consignment-form";

export const dynamic = "force-dynamic";

export default async function NewConsignmentPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CONSIGNMENT_OPS))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有登錄寄存品項的權限</p>
      </main>
    );
  }
  const lookup = await getNewConsignmentFormData();
  return <NewConsignmentForm lookup={lookup} />;
}

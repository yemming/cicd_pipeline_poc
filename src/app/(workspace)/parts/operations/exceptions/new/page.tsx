import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getNewAdjustmentFormData } from "@/domain/adjustments";

import { NewExceptionForm } from "./_components/new-exception-form";

export const dynamic = "force-dynamic";

export default async function NewExceptionPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EXCEPTION_OPS))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有建立例外調整單的權限</p>
      </main>
    );
  }
  const data = await getNewAdjustmentFormData();
  return <NewExceptionForm data={data} />;
}

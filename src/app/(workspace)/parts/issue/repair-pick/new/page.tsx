import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getRepairPickFormData } from "@/domain/issues";

import { NewRepairPickForm } from "./_components/new-repair-pick-form";

export const dynamic = "force-dynamic";

export default async function NewRepairPickPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ISSUE_CREATE))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有建立領料單的權限</p>
      </main>
    );
  }

  const data = await getRepairPickFormData();
  return <NewRepairPickForm data={data} />;
}

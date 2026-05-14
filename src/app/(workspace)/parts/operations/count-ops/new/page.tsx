import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getNewCountSessionFormData } from "@/domain/count";

import { NewCountSessionForm } from "./_components/new-count-session-form";

export const dynamic = "force-dynamic";

export default async function NewCountSessionPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.COUNT_EXECUTE))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有建立盤點 session 的權限</p>
      </main>
    );
  }
  const { warehouses } = await getNewCountSessionFormData();
  return <NewCountSessionForm warehouses={warehouses} />;
}

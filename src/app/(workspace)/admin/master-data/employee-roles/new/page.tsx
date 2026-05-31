import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { EmployeeRoleDetailView } from "../[id]/_components/employee-role-detail-view";

export const dynamic = "force-dynamic";

export default async function EmployeeRoleNewPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.EMPLOYEE_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有新增員工角色的權限</p>
      </main>
    );
  }

  return (
    <EmployeeRoleDetailView role={null} canEdit initialMode="create" />
  );
}

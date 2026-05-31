import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getEmployeeRoleType } from "@/domain/employee-roles";

import { EmployeeRoleDetailView } from "./_components/employee-role-detail-view";

export const dynamic = "force-dynamic";

export default async function EmployeeRoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.EMPLOYEE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視員工角色主檔的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.EMPLOYEE_EDIT);

  const { id } = await params;
  const role = await getEmployeeRoleType(id);

  return (
    <EmployeeRoleDetailView role={role} canEdit={canEdit} initialMode="view" />
  );
}

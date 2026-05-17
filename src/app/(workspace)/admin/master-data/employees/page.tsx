import { redirect } from "next/navigation";

import { listDepartments, listEmployees } from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { EmployeesBoard } from "./_components/employees-board";

export const dynamic = "force-dynamic";

export default async function EmployeesAdminPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EMPLOYEE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視員工的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.EMPLOYEE_EDIT);
  const [employees, departments] = await Promise.all([
    listEmployees({ limit: 200 }),
    listDepartments(),
  ]);

  return (
    <EmployeesBoard
      rows={employees}
      canEdit={canEdit}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}

import { notFound, redirect } from "next/navigation";

import { getEmployeeById, listDepartments } from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { EmployeeDetailView } from "./_components/employee-detail-view";

export const dynamic = "force-dynamic";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EMPLOYEE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視員工的權限</p>
      </main>
    );
  }

  const [employee, departments] = await Promise.all([
    getEmployeeById(id),
    listDepartments(),
  ]);
  if (!employee) notFound();

  const canEdit = await hasPermission(PERMISSIONS.EMPLOYEE_EDIT);

  return (
    <EmployeeDetailView
      employee={employee}
      departments={departments.map((d) => ({ id: d.id, code: d.code, name: d.name }))}
      canEdit={canEdit}
    />
  );
}

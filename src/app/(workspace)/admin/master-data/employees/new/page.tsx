import { redirect } from "next/navigation";

import { listDepartments } from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { EmployeeDetailView } from "../[id]/_components/employee-detail-view";

export const dynamic = "force-dynamic";

export default async function NewEmployeePage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EMPLOYEE_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立員工的權限</p>
      </main>
    );
  }

  const departments = await listDepartments();

  return (
    <EmployeeDetailView
      employee={null}
      departments={departments.map((d) => ({ id: d.id, code: d.code, name: d.name }))}
      canEdit
      initialMode="create"
    />
  );
}

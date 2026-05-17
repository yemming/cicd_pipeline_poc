import { redirect } from "next/navigation";

import { listDepartments, listEmployees } from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { DepartmentsBoard } from "./_components/departments-board";

export const dynamic = "force-dynamic";

export default async function DepartmentsAdminPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ORG_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視組織的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.ORG_EDIT);
  const [departments, employees] = await Promise.all([
    listDepartments({ activeOnly: false }),
    listEmployees({ status: "active", limit: 200 }),
  ]);

  return (
    <DepartmentsBoard
      rows={departments}
      canEdit={canEdit}
      employees={employees.map((e) => ({
        id: e.id,
        name: e.name,
        emp_code: e.emp_code,
      }))}
    />
  );
}

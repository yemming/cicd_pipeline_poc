import { redirect } from "next/navigation";

import {
  listDepartments,
  listEmployees,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { DepartmentDetailView } from "../[id]/_components/department-detail-view";

export const dynamic = "force-dynamic";

export default async function NewDepartmentPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ORG_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立部門的權限</p>
      </main>
    );
  }

  const [parents, employees] = await Promise.all([
    listDepartments({ activeOnly: true }),
    listEmployees({ status: "active", limit: 500 }),
  ]);

  return (
    <DepartmentDetailView
      department={null}
      parents={parents.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
      employees={employees.map((e) => ({
        id: e.id,
        emp_code: e.emp_code,
        name: e.name,
        position: e.position,
      }))}
      headcount={0}
      canEdit
      initialMode="create"
    />
  );
}

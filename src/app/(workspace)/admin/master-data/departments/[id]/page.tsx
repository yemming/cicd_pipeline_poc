import { notFound, redirect } from "next/navigation";

import {
  getDepartmentById,
  listDepartments,
  listEmployees,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { DepartmentDetailView } from "./_components/department-detail-view";

export const dynamic = "force-dynamic";

export default async function EditDepartmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ORG_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視組織的權限</p>
      </main>
    );
  }

  const [department, parents, employees] = await Promise.all([
    getDepartmentById(id),
    listDepartments({ activeOnly: true }),
    listEmployees({ status: "active", limit: 500 }),
  ]);
  if (!department) notFound();

  // 在編人數
  const members = await listEmployees({ deptId: department.id, limit: 500 });
  const headcount = members.length;

  const canEdit = await hasPermission(PERMISSIONS.ORG_EDIT);

  return (
    <DepartmentDetailView
      department={department}
      parents={parents.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
      employees={employees.map((e) => ({
        id: e.id,
        emp_code: e.emp_code,
        name: e.name,
        position: e.position,
      }))}
      headcount={headcount}
      canEdit={canEdit}
    />
  );
}

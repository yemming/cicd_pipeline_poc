import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getEmployeeById, listDepartments } from "@/lib/master-data/queries";
import { updateEmployeeAction } from "@/lib/master-data/employee-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { EmployeeForm } from "../_components/employee-form";

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
    <main className="px-6 py-6 max-w-[920px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/employees" className="hover:text-[#172B4D]">
          員工主檔
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">{employee.emp_code} {employee.name}</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">
          編輯員工 ・ {employee.name}
        </h1>
        <p className="text-[13px] text-[#6B778C]">
          建立於 {new Date(employee.created_at).toLocaleString("zh-TW")} ・
          最近更新 {new Date(employee.updated_at).toLocaleString("zh-TW")}
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        {canEdit ? (
          <EmployeeForm
            mode="edit"
            action={updateEmployeeAction}
            employee={employee}
            departments={departments}
          />
        ) : (
          <p className="text-[14px] text-[#6B778C]">
            僅可檢視；沒有編輯權限
          </p>
        )}
      </section>
    </main>
  );
}

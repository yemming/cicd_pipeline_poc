import Link from "next/link";
import { redirect } from "next/navigation";

import { listDepartments } from "@/lib/master-data/queries";
import { createEmployeeAction } from "@/lib/master-data/employee-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { EmployeeForm } from "../_components/employee-form";

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
    <main className="px-6 py-6 max-w-[920px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/employees" className="hover:text-[#172B4D]">
          員工主檔
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">新增員工</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">新增員工</h1>
        <p className="text-[13px] text-[#6B778C]">
          brand 由部署環境自動帶入；同 brand 內代碼不可重複
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        <EmployeeForm
          mode="create"
          action={createEmployeeAction}
          departments={departments}
        />
      </section>
    </main>
  );
}

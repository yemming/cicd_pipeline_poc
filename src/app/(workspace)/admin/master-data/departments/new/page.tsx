import Link from "next/link";
import { redirect } from "next/navigation";

import {
  listDepartments,
  listEmployees,
} from "@/lib/master-data/queries";
import { createDepartmentAction } from "@/lib/master-data/department-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { DepartmentForm } from "../_components/department-form";

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
    listEmployees({ status: "active", limit: 200 }),
  ]);

  return (
    <main className="px-6 py-6 max-w-[900px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/departments" className="hover:text-[#172B4D]">
          部門組織
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">新增部門</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">新增部門</h1>
        <p className="text-[13px] text-[#6B778C]">
          代碼與名稱必填；上層部門 / 主管可日後補完
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        <DepartmentForm
          mode="create"
          action={createDepartmentAction}
          parents={parents}
          employees={employees}
        />
      </section>
    </main>
  );
}

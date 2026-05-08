import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getDepartmentById,
  listDepartments,
  listEmployees,
} from "@/lib/master-data/queries";
import { updateDepartmentAction } from "@/lib/master-data/department-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { DepartmentForm } from "../_components/department-form";

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
    listEmployees({ status: "active", limit: 200 }),
  ]);
  if (!department) notFound();

  // 員工數量提示（部門停用前的影響範圍）
  const headcount = await listEmployees({ deptId: department.id, limit: 500 });

  const canEdit = await hasPermission(PERMISSIONS.ORG_EDIT);

  return (
    <main className="px-6 py-6 max-w-[900px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/departments" className="hover:text-[#172B4D]">
          部門組織
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">
          {department.code} ・ {department.name}
        </span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">
          編輯部門 ・ {department.name}
        </h1>
        <p className="text-[13px] text-[#6B778C]">
          建立於{" "}
          {new Date(department.created_at).toLocaleString("zh-TW", {
            timeZone: "Asia/Taipei",
          })}
          {headcount.length > 0 && (
            <span className="ml-2 text-[#0747A6]">・ 在編 {headcount.length} 人</span>
          )}
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        {canEdit ? (
          <DepartmentForm
            mode="edit"
            action={updateDepartmentAction}
            department={department}
            parents={parents}
            employees={employees}
          />
        ) : (
          <p className="text-[14px] text-[#6B778C]">僅可檢視；沒有編輯權限</p>
        )}
      </section>
    </main>
  );
}

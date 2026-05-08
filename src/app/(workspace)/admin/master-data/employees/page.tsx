import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { listDepartments, listEmployees } from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  active: "在職",
  on_leave: "留停",
  terminated: "離職",
  retired: "退休",
};

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
  const deptById = new Map(departments.map((d) => [d.id, d]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-bold text-[#172B4D]">員工主檔</h1>
          <p className="text-[13px] text-[#6B778C]">
            共 {employees.length} 筆 ・ 部門 {departments.length} 個
          </p>
        </div>
        {canEdit && (
          <Link
            href="/admin/master-data/employees/new"
            className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-[14px] font-semibold rounded"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增員工
          </Link>
        )}
      </header>

      <DataTable
        rows={employees}
        getKey={(e) => e.id}
        rowHref={canEdit ? (e) => `/admin/master-data/employees/${e.id}` : undefined}
        columns={[
          {
            key: "emp_code",
            header: "代碼",
            cell: (e) => <span className="font-mono">{e.emp_code}</span>,
            width: "140px",
          },
          { key: "name", header: "姓名", cell: (e) => e.name, width: "140px" },
          {
            key: "dept",
            header: "部門",
            cell: (e) => (e.dept_id ? (deptById.get(e.dept_id)?.name ?? "—") : "—"),
            width: "120px",
          },
          { key: "position", header: "職稱", cell: (e) => e.position ?? "—", width: "140px" },
          { key: "phone", header: "電話", cell: (e) => e.phone ?? "—", width: "140px" },
          { key: "email", header: "Email", cell: (e) => e.email ?? "—" },
          {
            key: "status",
            header: "在職",
            width: "80px",
            cell: (e) => {
              const label = STATUS_LABEL[e.employment_status] ?? e.employment_status;
              const color =
                e.employment_status === "active"
                  ? "bg-[#E3FCEF] text-[#006644]"
                  : e.employment_status === "on_leave"
                    ? "bg-[#FFF7D6] text-[#7F5F01]"
                    : "bg-[#FFEBE6] text-[#BF2600]";
              return (
                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${color}`}>
                  {label}
                </span>
              );
            },
          },
        ]}
        empty="尚未建立任何員工 — 點右上角「新增員工」開始"
      />
    </main>
  );
}

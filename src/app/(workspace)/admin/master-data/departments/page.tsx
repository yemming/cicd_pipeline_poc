import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import {
  listDepartments,
  listEmployees,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

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
  const deptById = new Map(departments.map((d) => [d.id, d]));
  const empById = new Map(employees.map((e) => [e.id, e]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-bold text-[#172B4D]">部門組織</h1>
          <p className="text-[13px] text-[#6B778C]">
            共 {departments.length} 筆 ・ 員工主檔的 dept_id 吃此處
          </p>
        </div>
        {canEdit && (
          <Link
            href="/admin/master-data/departments/new"
            className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-[14px] font-semibold rounded"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增部門
          </Link>
        )}
      </header>

      <DataTable
        rows={departments}
        getKey={(d) => d.id}
        rowHref={canEdit ? (d) => `/admin/master-data/departments/${d.id}` : undefined}
        columns={[
          {
            key: "code",
            header: "代碼",
            cell: (d) => <span className="font-mono">{d.code}</span>,
            width: "120px",
          },
          {
            key: "name",
            header: "部門名稱",
            cell: (d) => <span className="font-medium">{d.name}</span>,
          },
          {
            key: "parent",
            header: "上層部門",
            cell: (d) =>
              d.parent_id ? (
                deptById.get(d.parent_id)?.name ?? "—"
              ) : (
                <span className="text-[#6B778C]">頂層</span>
              ),
            width: "160px",
          },
          {
            key: "manager",
            header: "主管",
            cell: (d) =>
              d.manager_employee_id ? (
                <span>
                  {empById.get(d.manager_employee_id)?.name ?? "(查無)"}
                  <span className="ml-1 text-[#6B778C] text-[12px]">
                    {empById.get(d.manager_employee_id)?.emp_code}
                  </span>
                </span>
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
            width: "180px",
          },
          {
            key: "active",
            header: "狀態",
            width: "70px",
            cell: (d) =>
              d.is_active ? (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#E3FCEF] text-[#006644]">
                  營運中
                </span>
              ) : (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#DFE1E6] text-[#42526E]">
                  停用
                </span>
              ),
          },
        ]}
        empty="尚無部門資料 — 點右上角「新增部門」開始建立"
      />
    </main>
  );
}

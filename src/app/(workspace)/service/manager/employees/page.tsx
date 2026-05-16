import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listAftersalesStaff,
  listAftersalesDepartments,
} from "@/domain/aftersales-staff";
import { AFTERSALES_STAFF_PAGE_SIZE_DEFAULT } from "@/domain/aftersales-staff.constants";

import { StaffBoard } from "../../../parts/aftersales/management/staff/_components/staff-board";

export const dynamic = "force-dynamic";

/**
 * 售後主管模組 — 員工 / 人員名冊（C13c）
 *
 * 規格：docs/DUCATI_v2_output/03_售後修護/02_售後主管設定/07_售後管理模組_v2.html
 *       § Tab A — 員工人員名冊（售後服務部門）
 *
 * 設計：reuse 既有 /parts/aftersales/management/staff 的 StaffBoard（同一份
 * <DataGrid> + filter + 職級權限對照表），藉 basePath / pageHeader prop 切換
 * 入口語境，避免雙路由維護成本。新增 / 編輯仍走 /parts/aftersales/management/staff/[id]
 * 與 /new，跟 C1 服務看板雙入口 pattern 一致。
 */

type SearchParams = Promise<{
  q?: string;
  grade?: string;
  dept?: string;
  status?: string;
  auth?: string;
  page?: string;
}>;

export default async function ServiceManagerEmployeesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EMPLOYEE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視員工名冊的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const filters = {
    q: sp.q ?? "",
    grade: sp.grade ?? "all",
    dept: sp.dept ?? "all",
    status: (sp.status ?? "all") as "all" | "active" | "inactive",
    auth: (sp.auth ?? "all") as "all" | "yes" | "no",
  };
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const pageSize = AFTERSALES_STAFF_PAGE_SIZE_DEFAULT;

  const [{ rows, totalCount }, departments, canEdit] = await Promise.all([
    listAftersalesStaff(filters, { page, pageSize }),
    listAftersalesDepartments(),
    hasPermission(PERMISSIONS.EMPLOYEE_EDIT),
  ]);

  return (
    <StaffBoard
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      departments={departments}
      filters={{
        q: filters.q,
        grade: filters.grade,
        dept: filters.dept,
        status: filters.status,
        auth: filters.auth,
      }}
      canEdit={canEdit}
      basePath="/service/manager/employees"
      pageHeader={{
        title: "員工人員名冊",
        caption:
          "售後服務部門人員（維修部 + 零配件部）。職級設定影響竣工複檢授權、折扣權限與系統功能存取。",
        sprintChip: "售後主管 · 13.3",
      }}
    />
  );
}

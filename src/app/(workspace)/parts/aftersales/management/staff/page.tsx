import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listAftersalesStaff,
  listAftersalesDepartments,
} from "@/domain/aftersales-staff";
import { AFTERSALES_STAFF_PAGE_SIZE_DEFAULT } from "@/domain/aftersales-staff.constants";

import { StaffBoard } from "./_components/staff-board";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  grade?: string;
  dept?: string;
  status?: string;
  auth?: string;
  page?: string;
}>;

export default async function AftersalesStaffPage({
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
    />
  );
}

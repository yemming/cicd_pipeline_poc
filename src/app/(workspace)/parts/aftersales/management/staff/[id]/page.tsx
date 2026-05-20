import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getAftersalesStaffById,
  getAftersalesStaffKpi,
  listAftersalesDepartments,
} from "@/domain/aftersales-staff";

import { StaffDetailView } from "./_components/staff-detail-view";

export const dynamic = "force-dynamic";

export default async function StaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  const { id } = await params;
  const [staff, departments, canEdit, kpi] = await Promise.all([
    getAftersalesStaffById(id),
    listAftersalesDepartments(),
    hasPermission(PERMISSIONS.EMPLOYEE_EDIT),
    getAftersalesStaffKpi(id),
  ]);
  if (!staff) notFound();

  return (
    <StaffDetailView
      staff={staff}
      departments={departments}
      initialMode="view"
      canEdit={canEdit}
      kpi={kpi}
    />
  );
}

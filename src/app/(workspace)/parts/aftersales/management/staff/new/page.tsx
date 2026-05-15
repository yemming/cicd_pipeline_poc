import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listAftersalesDepartments } from "@/domain/aftersales-staff";

import { StaffDetailView } from "../[id]/_components/staff-detail-view";

export const dynamic = "force-dynamic";

export default async function StaffNewPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EMPLOYEE_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有新增員工的權限</p>
      </main>
    );
  }

  const departments = await listAftersalesDepartments();

  return (
    <StaffDetailView
      staff={null}
      departments={departments}
      initialMode="create"
      canEdit={true}
    />
  );
}

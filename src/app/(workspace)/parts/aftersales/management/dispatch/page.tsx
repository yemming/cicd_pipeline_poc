import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listAftersalesTechnicians,
  computeDispatchKpis,
  computeDispatchTotals,
} from "@/domain/aftersales-technicians";
import { listTechnicianCandidateEmployees } from "@/domain/aftersales-staff";

import { DispatchDashboard } from "./_components/dispatch-dashboard";

export const dynamic = "force-dynamic";

export default async function DispatchBoardPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視派工看板的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_DISPATCH);

  const [technicians, kpis, totals, employeeCandidates] = await Promise.all([
    listAftersalesTechnicians(),
    computeDispatchKpis(),
    computeDispatchTotals(),
    listTechnicianCandidateEmployees(),
  ]);

  return (
    <DispatchDashboard
      technicians={technicians}
      kpis={kpis}
      totals={totals}
      canEdit={canEdit}
      employeeCandidates={employeeCandidates}
    />
  );
}

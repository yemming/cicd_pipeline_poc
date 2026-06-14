import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getFinalInspectionById } from "@/domain/final-inspections";
import { listActiveTechnicians } from "@/domain/aftersales-technicians";

import { FinalInspectionWizard } from "../_components/final-inspection-wizard";

export const dynamic = "force-dynamic";

export default async function FinalInspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視竣工複檢的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);
  const { id } = await params;
  const [data, technicians] = await Promise.all([
    getFinalInspectionById(id),
    listActiveTechnicians().catch(() => []),
  ]);
  if (!data) return notFound();
  return <FinalInspectionWizard data={data} canEdit={canEdit} technicians={technicians} />;
}

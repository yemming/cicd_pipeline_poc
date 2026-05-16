import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getPreInspectionById } from "@/domain/pre-inspections";
import { listEnvCheckItems } from "@/domain/env-check-items";

import { PreInspectionWizard } from "../_components/pre-inspection-wizard";

export const dynamic = "force-dynamic";

export default async function PreInspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視接待預檢的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);
  const { id } = await params;
  const [data, envCheckItems] = await Promise.all([
    getPreInspectionById(id),
    listEnvCheckItems({ activeOnly: true }),
  ]);
  if (!data) return notFound();
  return (
    <PreInspectionWizard data={data} canEdit={canEdit} envCheckItems={envCheckItems} />
  );
}

import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getPreInspectionById } from "@/domain/pre-inspections";
import { listEnvCheckItems } from "@/domain/env-check-items";
import { getBrandConfig } from "@/domain/brand-config";
import { getActiveScope } from "@/lib/scope/active-scope";
import { listVehiclePendingItems } from "@/domain/service-quotes";
import { listDamageDisputesByPiId } from "@/domain/damage-disputes";

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
  const scope = await getActiveScope();

  const [data, envCheckItems, brandConfig] = await Promise.all([
    getPreInspectionById(id),
    listEnvCheckItems({ activeOnly: true }),
    getBrandConfig(scope.brand_id),
  ]);
  if (!data) return notFound();

  // 撈車輛待處理項目（緊急橫幅 + 側欄）
  const pendingItems = data.vehicle_id
    ? await listVehiclePendingItems(scope.brand_id, data.vehicle_id)
    : [];

  // 撈損傷異議記錄（已寫入 DB 的不可逆記錄）
  const existingDisputes = await listDamageDisputesByPiId(id);

  return (
    <PreInspectionWizard
      data={data}
      canEdit={canEdit}
      envCheckItems={envCheckItems}
      hasDesmo={brandConfig.hasDesmo}
      pendingItems={pendingItems}
      existingDisputes={existingDisputes}
    />
  );
}

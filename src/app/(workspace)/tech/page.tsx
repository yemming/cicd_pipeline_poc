/**
 * 技師工作台 /tech（執行端，第十一輪 C4b）
 *
 * server component：權限檢查 + 解析當前技師 + 撈指派工單/KPI/轉派候選（全走 helper）。
 * 互動在 client component（_components/tech-workstation-board.tsx）。
 *
 * 天條：本頁禁 import @/lib/supabase，全走 @/domain/tech-workstation。
 */

import {
  getCurrentTechnician,
  listMyAssignedOrders,
  getMyWorkstationKpi,
  listOtherTechnicians,
  listItemOptionsForAddon,
  listWarehouseOptionsForAddon,
} from "@/domain/tech-workstation";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { TechWorkstationBoard } from "./_components/tech-workstation-board";
import { UnboundTechNotice } from "./_components/unbound-tech-notice";

export const dynamic = "force-dynamic";

export default async function TechWorkstationPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return (
      <main className="px-6 py-5">
        <p className="text-[14px] text-[#CC0000]">請先登入</p>
      </main>
    );
  }

  // 看我的單 = service.ro.view
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-5">
        <p className="text-[14px] text-[#CC0000]">無權限存取技師工作台（需要 service.ro.view）</p>
      </main>
    );
  }

  const technician = await getCurrentTechnician();
  if (!technician) {
    return <UnboundTechNotice />;
  }

  const [
    orders,
    kpi,
    otherTechs,
    itemOptions,
    warehouseOptions,
    canAccept,
    canExecute,
    canPropose,
    canDispatch,
  ] = await Promise.all([
    listMyAssignedOrders(technician.id),
    getMyWorkstationKpi(technician.id),
    listOtherTechnicians(technician.id),
    listItemOptionsForAddon(),
    listWarehouseOptionsForAddon(),
    hasPermission(PERMISSIONS.RO_ACCEPT),
    hasPermission(PERMISSIONS.RO_EXECUTE),
    hasPermission(PERMISSIONS.ADDON_PROPOSE),
    hasPermission(PERMISSIONS.RO_DISPATCH),
  ]);

  return (
    <TechWorkstationBoard
      technician={technician}
      initialOrders={orders}
      kpi={kpi}
      otherTechnicians={otherTechs}
      itemOptions={itemOptions}
      warehouseOptions={warehouseOptions}
      perms={{
        canAccept,
        canExecute,
        canPropose,
        canDispatch,
      }}
    />
  );
}

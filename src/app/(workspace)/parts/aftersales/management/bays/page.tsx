import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listServiceBays,
  computeBayKpis,
  computeBayEfficiency,
  getShopDailyHours,
} from "@/domain/service-bays";

import { BaysDashboard } from "./_components/bays-dashboard";

export const dynamic = "force-dynamic";

export default async function ServiceBaysPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視工位看板的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_DISPATCH);
  const dailyHours = await getShopDailyHours();

  const [bays, kpis, eff] = await Promise.all([
    listServiceBays(),
    computeBayKpis(),
    computeBayEfficiency(dailyHours),
  ]);

  return (
    <BaysDashboard
      bays={bays}
      kpis={kpis}
      efficiency={eff}
      dailyHours={dailyHours}
      canEdit={canEdit}
    />
  );
}

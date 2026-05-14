/**
 * /aftersales/crm/nps-dashboard
 *
 * Thin re-export — 與 /sales/crm/nps-dashboard 共用同一個 NpsDashboardView
 * 與 getSalesNpsDashboard helper，只差 kind='aftersales' + basePath / title
 * 鎖死在售後域。
 */
import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSalesNpsDashboard, type NpsFilters } from "@/domain/sales-nps";
import { RANGE_LABEL, type RangeKey } from "@/domain/sales-nps.constants";

import { NpsDashboardView } from "@/app/(workspace)/sales/crm/nps-dashboard/_components/nps-dashboard-view";

export const dynamic = "force-dynamic";

const VALID_RANGES: RangeKey[] = ["7d", "30d", "90d", "all"];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視售後 NPS 看板的權限</p>
      </main>
    );
  }
  const sp = await searchParams;
  const rangeRaw = sp.range as RangeKey | undefined;
  const range: RangeKey =
    rangeRaw && VALID_RANGES.includes(rangeRaw) ? rangeRaw : "90d";
  const filters: NpsFilters = { range, kind: "aftersales" };
  const dashboard = await getSalesNpsDashboard(filters);
  return (
    <NpsDashboardView
      data={dashboard}
      range={range}
      rangeLabel={RANGE_LABEL[range]}
      basePath="/aftersales/crm/nps-dashboard"
      title="售後 NPS 看板"
      sprintTag="CRM10"
      caption="售後維修滿意度淨推薦值（NPS）分析・趨勢／分組／批評者留言"
    />
  );
}

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getStoreOverview } from "@/domain/store-overview";
import type { StoreOverviewRangeKey } from "@/domain/store-overview.constants";

import { StoreReportView } from "./_components/store-report-view";

export const dynamic = "force-dynamic";

const VALID_RANGES: StoreOverviewRangeKey[] = ["30d", "90d", "ytd"];

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
        <p className="text-[14px] text-[#BF2600]">沒有檢視店長綜合報表的權限</p>
      </main>
    );
  }
  const sp = await searchParams;
  const rangeRaw = sp.range as StoreOverviewRangeKey | undefined;
  const range: StoreOverviewRangeKey =
    rangeRaw && VALID_RANGES.includes(rangeRaw) ? rangeRaw : "30d";

  const data = await getStoreOverview({ range });

  return <StoreReportView data={data} range={range} />;
}

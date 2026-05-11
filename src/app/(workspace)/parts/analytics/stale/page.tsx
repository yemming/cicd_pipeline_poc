import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getStaleAnalyticsPageData } from "@/domain/analytics";

import { StaleBoard } from "./_components/stale-board";

export const dynamic = "force-dynamic";

export default async function StaleAnalyticsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視呆滯庫存報表的權限</p>
      </main>
    );
  }
  const { overview, rows } = await getStaleAnalyticsPageData();
  return <StaleBoard overview={overview} rows={rows} />;
}

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getTurnoverPageData } from "@/domain/analytics";

import { TurnoverBoard } from "./_components/turnover-board";

export const dynamic = "force-dynamic";

export default async function TurnoverAnalyticsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視周轉率報表的權限</p>
      </main>
    );
  }
  const { overview, rows } = await getTurnoverPageData();
  return <TurnoverBoard overview={overview} rows={rows} />;
}

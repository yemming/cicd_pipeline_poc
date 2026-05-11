import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getAbcAnalyticsPageData } from "@/domain/analytics";

import { AbcBoard } from "./_components/abc-board";

export const dynamic = "force-dynamic";

export default async function AbcPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視 ABC 分類報表的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.ITEM_VIEW); // 沿用既有 recalc 權限
  const { overview, rows } = await getAbcAnalyticsPageData();
  return <AbcBoard overview={overview} rows={rows} canEdit={canEdit} />;
}

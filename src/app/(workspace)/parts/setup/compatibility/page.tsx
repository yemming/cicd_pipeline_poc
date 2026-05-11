import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCompatibilityPageData } from "@/domain/compatibility";

import { CompatibilityBoard } from "./_components/compatibility-board";

export const dynamic = "force-dynamic";

export default async function CompatibilityPage({
  searchParams,
}: {
  searchParams: Promise<{ series?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視適配設定的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const data = await getCompatibilityPageData({ series: sp.series });

  return (
    <CompatibilityBoard
      seriesList={data.seriesList}
      activeSeries={data.activeSeries}
      rows={data.rows}
      canEdit={data.canEdit}
    />
  );
}

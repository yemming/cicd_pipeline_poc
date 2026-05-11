import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCountPlansPageData } from "@/domain/count";

import { CountPlansBoard } from "./_components/count-plans-board";

export const dynamic = "force-dynamic";

export default async function CountPlansPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.COUNT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視盤點計畫的權限</p>
      </main>
    );
  }

  const { rows, canEdit } = await getCountPlansPageData();
  return <CountPlansBoard rows={rows} canEdit={canEdit} />;
}

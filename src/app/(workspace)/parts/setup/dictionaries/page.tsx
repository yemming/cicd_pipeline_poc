import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getDictionariesPageData } from "@/domain/dictionaries";

import { DictionariesBoard } from "./_components/dictionaries-board";

export const dynamic = "force-dynamic";

export default async function DictionariesPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視主檔對應的權限</p>
      </main>
    );
  }
  const { rows, canEdit, referenceCounts } = await getDictionariesPageData();
  return <DictionariesBoard rows={rows} canEdit={canEdit} referenceCounts={referenceCounts} />;
}

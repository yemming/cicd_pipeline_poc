import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listP1Prefixes, listP2Prefixes } from "@/domain/ro-numbering";

import { RoNumberingBoard } from "./_components/ro-numbering-board";

export const dynamic = "force-dynamic";

export default async function RoNumberingPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視工單編號規則的權限</p>
      </main>
    );
  }

  const [p1Rows, p2Rows, canEdit] = await Promise.all([
    listP1Prefixes(),
    listP2Prefixes(),
    hasPermission(PERMISSIONS.RO_DISPATCH),
  ]);

  return <RoNumberingBoard p1Rows={p1Rows} p2Rows={p2Rows} canEdit={canEdit} />;
}

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getPurchasePermissionsPageData } from "@/domain/rules";

import { PurchasePermissionsBoard } from "./_components/purchase-permissions-board";

export const dynamic = "force-dynamic";

export default async function PurchasePermissionsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PARTS_PURCHASE_PERMISSION_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視採購權限規則的權限</p>
      </main>
    );
  }

  const { authorityRules, workflowRules, roles, canEdit } =
    await getPurchasePermissionsPageData();

  return (
    <PurchasePermissionsBoard
      authorityRules={authorityRules}
      workflowRules={workflowRules}
      roles={roles}
      canEdit={canEdit}
    />
  );
}

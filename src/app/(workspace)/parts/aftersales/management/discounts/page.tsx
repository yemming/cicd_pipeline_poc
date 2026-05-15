import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getAftersalesDiscountsPageData } from "@/domain/aftersales-discounts";

import { DiscountsBoard } from "./_components/discounts-board";

export const dynamic = "force-dynamic";

export default async function AftersalesDiscountsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.AFTERSALES_DISCOUNT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視崗位折扣審批設定的權限</p>
      </main>
    );
  }

  const { authorityRules, workflowRule, roles, canEdit } =
    await getAftersalesDiscountsPageData();

  return (
    <DiscountsBoard
      authorityRules={authorityRules}
      workflowRule={workflowRule}
      roles={roles}
      canEdit={canEdit}
    />
  );
}

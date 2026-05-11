import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCountRulesPageData } from "@/domain/rules";

import { CountRulesBoard } from "./_components/count-rules-board";

export const dynamic = "force-dynamic";

export default async function CountRulesPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PARTS_COUNT_RULE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視盤點回傳規則的權限</p>
      </main>
    );
  }

  const { toleranceRule, workflowRules, canEdit } = await getCountRulesPageData();

  return (
    <CountRulesBoard
      toleranceRule={toleranceRule}
      workflowRules={workflowRules}
      canEdit={canEdit}
    />
  );
}

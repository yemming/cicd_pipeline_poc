import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getAlertRulesPageData } from "@/domain/rules";

import { AlertRulesBoard } from "./_components/alert-rules-board";

export const dynamic = "force-dynamic";

export default async function AlertRulesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    priority?: string;
    tone?: string;
    is_active?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ALERT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視告警規則的權限</p>
      </main>
    );
  }

  const sp = (await searchParams) ?? {};
  const filter = {
    q: sp.q || undefined,
    priority: sp.priority || undefined,
    tone: sp.tone || undefined,
    is_active:
      sp.is_active === "true" ? true : sp.is_active === "false" ? false : undefined,
  };

  const { rules, canEdit } = await getAlertRulesPageData(filter);

  return (
    <AlertRulesBoard
      rules={rules}
      canEdit={canEdit}
      initialQ={sp.q ?? ""}
      initialPriority={sp.priority ?? ""}
      initialTone={sp.tone ?? ""}
      initialIsActive={sp.is_active ?? ""}
    />
  );
}

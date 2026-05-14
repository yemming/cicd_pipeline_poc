import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getAlertEscalationPageData } from "@/domain/rules";

import { EscalationBoard } from "./_components/escalation-board";

export const dynamic = "force-dynamic";

export default async function AlertEscalationPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    level?: string;
    is_active?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ALERT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視告警階層的權限</p>
      </main>
    );
  }

  const sp = (await searchParams) ?? {};
  const levelNum = sp.level ? Number(sp.level) : undefined;
  const filter = {
    q: sp.q || undefined,
    level: levelNum !== undefined && Number.isFinite(levelNum) ? levelNum : undefined,
    is_active:
      sp.is_active === "true" ? true : sp.is_active === "false" ? false : undefined,
  };

  const { rules, canEdit } = await getAlertEscalationPageData(filter);

  return (
    <EscalationBoard
      rules={rules}
      canEdit={canEdit}
      initialQ={sp.q ?? ""}
      initialLevel={sp.level ?? ""}
      initialIsActive={sp.is_active ?? ""}
    />
  );
}

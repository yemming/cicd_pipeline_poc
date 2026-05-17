import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listPushTemplates } from "@/domain/sales-push-templates";
import { listPushCampaigns, getPushBoardKpi } from "@/domain/sales-push-campaigns";

import { PushNotificationsBoard } from "./_components/push-notifications-board";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; step?: string; category?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視推播通知的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);

  const sp = await searchParams;
  const tab = (sp.tab as "templates" | "new" | "log") ?? "templates";
  const step = Number.parseInt(sp.step ?? "1", 10) || 1;
  const category = sp.category ?? "";

  const [templates, campaigns, kpi] = await Promise.all([
    listPushTemplates("sales"),
    listPushCampaigns("sales"),
    getPushBoardKpi("sales"),
  ]);

  return (
    <PushNotificationsBoard
      kind="sales"
      canEdit={canEdit}
      title="推播通知管理"
      sprintLabel="CRM06A"
      moduleLabel="銷售"
      templates={templates}
      campaigns={campaigns}
      kpi={kpi}
      initialTab={tab}
      initialStep={Math.min(3, Math.max(1, step))}
      initialCategory={category}
    />
  );
}

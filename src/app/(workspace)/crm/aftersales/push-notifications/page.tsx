/**
 * CRM06B 售後推播通知管理 — 共用 sales 模組的 board，鎖死 kind='aftersales'。
 *
 * 底層走 push_message_templates / push_campaigns 表的 kind='aftersales' row。
 * A 級對齊（M02-8）：透過 extraAnalyticsSlot / extraLogTopSlot 注入
 *   - FunnelChart（送達 → 已讀 → 點擊 → 轉化進廠）
 *   - BarChart（各範本開啟率排行）
 *   - 標準 @/components/visualization/KpiCard（取代原生本地 KpiCard）
 */
import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listPushTemplates } from "@/domain/sales-push-templates";
import { listPushCampaigns, getPushBoardKpi } from "@/domain/sales-push-campaigns";
import { listAutomationRules } from "@/domain/sales-push-automation";

import { PushNotificationsBoard } from "../../sales/push-notifications/_components/push-notifications-board";
import {
  AftersalesPushAnalyticsHeader,
  AftersalesPushTemplateRanking,
} from "./_components/aftersales-push-analytics";

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

  const [templates, campaigns, kpi, automationRules] = await Promise.all([
    listPushTemplates("aftersales"),
    listPushCampaigns("aftersales"),
    getPushBoardKpi("aftersales"),
    listAutomationRules("aftersales"),
  ]);

  return (
    <PushNotificationsBoard
      kind="aftersales"
      canEdit={canEdit}
      title="推播通知管理"
      sprintLabel="CRM06B"
      moduleLabel="售後"
      templates={templates}
      campaigns={campaigns}
      kpi={kpi}
      automationRules={automationRules}
      initialTab={tab}
      initialStep={Math.min(3, Math.max(1, step))}
      initialCategory={category}
      extraAnalyticsSlot={
        <AftersalesPushAnalyticsHeader kpi={kpi} campaigns={campaigns} />
      }
      extraLogTopSlot={
        <AftersalesPushTemplateRanking templates={templates} campaigns={campaigns} />
      }
    />
  );
}

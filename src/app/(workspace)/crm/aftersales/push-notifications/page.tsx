/**
 * Thin re-export — 推播通知設定（售後 module）
 *
 * 共用 sales 模組的 board / actions / domain helper，鎖死 module='aftersales'，
 * 透過 props 切換標題、副標、Sprint chip。底層走 `notification_subscriptions.module='aftersales'`
 * 的 row（見 src/lib/sales/sales-notifications-actions.ts、src/domain/sales-notifications.ts）。
 */
import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSalesNotificationsBoardData } from "@/domain/sales-notifications";

import { PushNotificationsBoard } from "../../sales/push-notifications/_components/push-notifications-board";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視推播通知設定的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const data = await getSalesNotificationsBoardData("aftersales");
  return (
    <PushNotificationsBoard
      data={data}
      canEdit={canEdit}
      module="aftersales"
      title="推播通知設定"
      sprintLabel="AS-CRM06"
      moduleLabel="售後"
    />
  );
}

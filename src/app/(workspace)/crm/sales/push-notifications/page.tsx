import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSalesNotificationsBoardData } from "@/domain/sales-notifications";

import { PushNotificationsBoard } from "./_components/push-notifications-board";

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
  const data = await getSalesNotificationsBoardData("sales");
  return (
    <PushNotificationsBoard
      data={data}
      canEdit={canEdit}
      module="sales"
      title="推播通知設定"
      sprintLabel="CRM06"
      moduleLabel="銷售"
    />
  );
}

/**
 * 取車通知設定 — 售後工單模組設定
 *
 * 設計稿：docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/11_取車通知設定.html
 * Domain helper：@/domain/aftersales-pickup-notify
 */
import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getPickupNotifySettings } from "@/domain/aftersales-pickup-notify";

import { PickupNotifyForm } from "./_components/pickup-notify-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "取車通知設定 | DealerOS" };

export default async function Page() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視取車通知設定的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const settings = await getPickupNotifySettings();

  return <PickupNotifyForm settings={settings} canEdit={canEdit} />;
}

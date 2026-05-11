import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSerialTrackingPageData } from "@/domain/rules";

import { SerialBoard } from "./_components/serial-board";

export const dynamic = "force-dynamic";

export default async function SerialPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PARTS_SERIAL_RULE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視序列號設定的權限</p>
      </main>
    );
  }

  const { rules, canEdit } = await getSerialTrackingPageData();
  return <SerialBoard rules={rules} canEdit={canEdit} />;
}

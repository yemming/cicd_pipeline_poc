import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  getRoLinkConfig,
  listRoLinkRecords,
} from "@/domain/warranty";

import { RoLinkBoard } from "./_components/ro-link-board";

export const dynamic = "force-dynamic";

export default async function RoLinkPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WARRANTY_VIEW))) {
    return (
      <main className="px-6 py-5">
        <p className="text-[14px] text-[#CC0000]">
          沒有檢視 RO 工單串接設定的權限
        </p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.WARRANTY_SUBMIT);
  const [config, records] = await Promise.all([
    getRoLinkConfig(),
    listRoLinkRecords(),
  ]);
  return <RoLinkBoard config={config} records={records} canEdit={canEdit} />;
}

/**
 * 休眠流失管理（售後）Create Page
 * Thin re-export：reuse sales 版 detail-view 的 create mode，
 * kind 鎖 'aftersales'、basePath 指 aftersales。
 */

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { DormantLeadDetailView } from "../../../sales/dormant-leads/[id]/_components/dormant-lead-detail-view";

export const dynamic = "force-dynamic";

const BASE_PATH = "/crm/aftersales/dormant-customers";

export default async function Page() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有新增流失客戶的權限</p>
      </main>
    );
  }
  return (
    <DormantLeadDetailView
      lead={null}
      canEdit={true}
      initialMode="create"
      basePath={BASE_PATH}
      kind="aftersales"
    />
  );
}

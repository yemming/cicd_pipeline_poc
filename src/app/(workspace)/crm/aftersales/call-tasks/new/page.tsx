/**
 * 售後電訪任務 Create Page
 * Thin re-export：reuse sales 版 detail-view 的 create mode，
 * initialKind 鎖 'aftersales'、basePath 指 aftersales。
 */

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCallTaskLookups } from "@/domain/sales-call-tasks";

import { CallTaskDetailView } from "../../../sales/call-tasks/[id]/_components/call-task-detail-view";

export const dynamic = "force-dynamic";

const BASE_PATH = "/crm/aftersales/call-tasks";

export default async function Page() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有新增電訪任務的權限</p>
      </main>
    );
  }
  const lookups = await getCallTaskLookups("aftersales");

  return (
    <CallTaskDetailView
      task={null}
      canEdit
      initialMode="create"
      initialKind="aftersales"
      customers={lookups.customers}
      surveys={lookups.surveys}
      basePath={BASE_PATH}
    />
  );
}

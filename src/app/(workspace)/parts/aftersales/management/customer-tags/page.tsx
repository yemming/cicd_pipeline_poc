import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listAllOfficialTags } from "@/domain/customer-tags";
import { computeTagKpi } from "@/domain/customer-tags.constants";

import { CustomerTagsBoard } from "./_components/customer-tags-board";

export const dynamic = "force-dynamic";

export default async function AftersalesCustomerTagsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.AFTERSALES_PERMISSION_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視主管工作檯的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.AFTERSALES_PERMISSION_EDIT);
  const tags = await listAllOfficialTags();
  const kpi = computeTagKpi(tags);

  return <CustomerTagsBoard tags={tags} kpi={kpi} canEdit={canEdit} />;
}

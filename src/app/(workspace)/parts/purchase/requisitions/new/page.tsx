import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getRequisitionsNewPageData } from "@/domain/requisitions";

import {
  RequisitionDetailView,
  type DetailRequisition,
} from "../[id]/_components/requisition-detail-view";

export const dynamic = "force-dynamic";

const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";

const placeholder: DetailRequisition = {
  id: PLACEHOLDER_ID,
  req_no: "",
  org_id: null,
  status: "submitted",
  required_date: null,
  notes: null,
  source: "manual",
  approved_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export default async function NewRequisitionPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.PR_CREATE))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立需求單的權限</p>
      </main>
    );
  }

  const { items, orgs } = await getRequisitionsNewPageData();

  return (
    <RequisitionDetailView
      requisition={placeholder}
      lines={[]}
      items={items}
      orgs={orgs}
      canEdit={true}
      canApprove={false}
      forceCreating={true}
    />
  );
}

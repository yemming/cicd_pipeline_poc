import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
import {
  RequisitionDetailView,
  type DetailRequisition,
  type ItemRef,
  type OrgRef,
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

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const [orgsRes, itemsRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("items")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code")
      .limit(500),
  ]);

  return (
    <RequisitionDetailView
      requisition={placeholder}
      lines={[]}
      items={(itemsRes.data ?? []) as unknown as ItemRef[]}
      orgs={(orgsRes.data ?? []) as unknown as OrgRef[]}
      canEdit={true}
      canApprove={false}
      forceCreating={true}
    />
  );
}

import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getDormantLeadById } from "@/domain/sales-dormant-leads";

import { DormantLeadDetailView } from "./_components/dormant-lead-detail-view";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const { id } = await params;
  const lead = await getDormantLeadById(id, "sales");
  if (!lead) notFound();
  return (
    <DormantLeadDetailView
      lead={lead}
      canEdit={canEdit}
      basePath="/crm/sales/dormant-leads"
    />
  );
}

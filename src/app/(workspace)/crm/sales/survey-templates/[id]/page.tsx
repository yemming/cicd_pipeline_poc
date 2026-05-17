import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSurveyTemplateDetail } from "@/domain/sales-survey-templates";
// Note: runtime helper still server-only; type-only import below from .constants is client-safe.

import { SurveyTemplateDetailView } from "./_components/survey-template-detail-view";

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
        <p className="text-[14px] text-[#BF2600]">沒有檢視電訪問卷的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const { id } = await params;
  const survey = await getSurveyTemplateDetail(id);
  if (!survey) notFound();

  return (
    <SurveyTemplateDetailView
      survey={survey}
      canEdit={canEdit}
      initialMode="view"
    />
  );
}

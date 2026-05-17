import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { SurveyKind } from "@/domain/sales-survey-templates.constants";

import { SurveyTemplateDetailView } from "../[id]/_components/survey-template-detail-view";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有新增電訪問卷的權限</p>
      </main>
    );
  }
  const sp = await searchParams;
  const kind: SurveyKind = sp.kind === "aftersales" ? "aftersales" : "sales";
  return (
    <SurveyTemplateDetailView
      survey={null}
      canEdit
      initialMode="create"
      initialKind={kind}
    />
  );
}

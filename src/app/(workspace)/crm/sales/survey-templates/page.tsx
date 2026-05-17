import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSurveyTemplateListPageData } from "@/domain/sales-survey-templates";
import type {
  SurveyKind,
  SurveyTemplateFilters,
} from "@/domain/sales-survey-templates.constants";

import { SurveyTemplatesBoard } from "./_components/survey-templates-board";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
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
  const sp = await searchParams;
  const kind: SurveyKind = sp.kind === "aftersales" ? "aftersales" : "sales";
  const filters: SurveyTemplateFilters = {
    kind,
    status: sp.status ?? "all",
    meta_status: sp.meta_status ?? "all",
    timing: sp.timing ?? "all",
    q: sp.q ?? "",
  };
  const { rows, kpi, totalCount } = await getSurveyTemplateListPageData(filters);
  return (
    <SurveyTemplatesBoard
      rows={rows}
      kpi={kpi}
      totalCount={totalCount}
      canEdit={canEdit}
      filters={filters}
    />
  );
}

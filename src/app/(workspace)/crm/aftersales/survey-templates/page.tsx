/**
 * 售後電訪問卷 List Page
 *
 * Thin re-export：directly reuse sales 版的 SurveyTemplatesBoard，
 * 只是 basePath 換成 /aftersales/...、kind 預設 'aftersales'。
 *
 * Schema 共用同一張 survey_templates 表（kind = 'sales' | 'aftersales'）。
 */

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSurveyTemplateListPageData } from "@/domain/sales-survey-templates";
import type {
  SurveyKind,
  SurveyTemplateFilters,
} from "@/domain/sales-survey-templates.constants";

import { SurveyTemplatesBoard } from "../../sales/survey-templates/_components/survey-templates-board";

export const dynamic = "force-dynamic";

const BASE_PATH = "/crm/aftersales/survey-templates";

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
  // aftersales 路徑下 kind 鎖死 aftersales，避免 user 自己手動改 querystring 跳銷售側
  const kind: SurveyKind = "aftersales";
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
      basePath={BASE_PATH}
    />
  );
}

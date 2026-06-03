import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  getGroupQuarterlyReportForPrint,
  listReportableQuarters,
} from "@/domain/group-quarterly-report";

import { QuarterlyReportBoard } from "./_components/quarterly-report-board";

export const dynamic = "force-dynamic";

/**
 * GRP05 集團季度績效報告（集團管理 · 策略評估層）
 *
 * 集團主管的季度績效彙整頁：核心 KPI + 逐店評級摘要，提供「開啟完整報告 /
 * 匯出 PDF」走既有 /api/pdf pattern（print route /print/group-quarterly-report/[id]）。
 *
 * 權限沿用 group/* 的 isAdmin 守門；brand_id 走 getActiveScope()。
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-quarterly-report helper。
 */
export default async function GroupQuarterlyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">集團季度績效報告僅限管理者使用</p>
      </main>
    );
  }

  const { brand_id } = await getActiveScope();
  const { q } = await searchParams;
  const quarters = await listReportableQuarters(brand_id);
  const report = await getGroupQuarterlyReportForPrint(brand_id, q);

  return <QuarterlyReportBoard report={report} quarters={quarters} />;
}

import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getPrintBrandBuyer } from "@/lib/pdf/print-context";
import { getGroupQuarterlyReportForPrint } from "@/domain/group-quarterly-report";

import { GroupQuarterlyReportPrintable } from "./_components/group-quarterly-report-printable";

export const dynamic = "force-dynamic";

/**
 * GRP05 集團季度績效報告 — 列印 / PDF 預覽路由。
 * [id] = 季度 key（例：2026-Q1）；brand 走 getActiveScope() cookie。
 * 權限＝集團管理者（沿用 group/* 的 isAdmin 守門）。
 */
export default async function GroupQuarterlyReportPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main style={{ padding: "32px", color: "#CC0000", fontSize: "14px" }}>
        沒有列印集團季度績效報告的權限
      </main>
    );
  }

  const { id } = await params;
  const { brand_id } = await getActiveScope();
  const [report, { brand }] = await Promise.all([
    getGroupQuarterlyReportForPrint(brand_id, id),
    getPrintBrandBuyer(brand_id, null),
  ]);
  if (!report) notFound();

  return <GroupQuarterlyReportPrintable data={report} brand={brand} />;
}

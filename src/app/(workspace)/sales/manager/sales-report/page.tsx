/**
 * 業績報表 — server component (M01-2 A 級升級)
 *
 * Pipeline:
 *   1. 權限 gate (SALES_ORDER_VIEW)
 *   2. parse filter from searchParams
 *   3. Promise.all 撈 helper bundle
 *   4. 交給 client board 渲染
 *
 * Error 狀態：try/catch 在 page 層，撈不到資料 → 顯示錯誤頁、不直接 crash。
 */

import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSalesReportBundle } from "@/domain/sales-report";
import type { ReportPeriod } from "@/domain/sales-report.constants";
import SalesReportBoard from "./_components/sales-report-board";

export const metadata = {
  title: "業績報表 | DealerOS",
};

type SearchParams = {
  period?: string;
  sa?: string;
  model?: string;
  source?: string;
};

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // ─── 權限 gate ───────────────────────────────────────────
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_VIEW))) {
    return (
      <main className="px-6 py-10 text-center">
        <div className="inline-block bg-white border border-[#F5AEAD] rounded-lg px-6 py-5">
          <div className="text-[40px] mb-2">🔒</div>
          <div className="text-[14px] font-semibold text-[#C8001A] mb-1">權限不足</div>
          <div className="text-[12px] text-[#5A5955]">
            您沒有檢視業績報表的權限（需要 sales.order.view）。請聯繫系統管理員。
          </div>
        </div>
      </main>
    );
  }

  // ─── parse filter ───────────────────────────────────────
  const sp = await searchParams;
  const periodRaw = (sp.period ?? "month") as ReportPeriod;
  const period: ReportPeriod = (["month", "quarter", "year"] as const).includes(
    periodRaw as ReportPeriod,
  )
    ? periodRaw
    : "month";
  const saName = sp.sa ?? null;
  const modelId = sp.model ?? null;
  const source = sp.source ?? null;

  // ─── 撈資料 + error boundary ─────────────────────────────
  let bundle: Awaited<ReturnType<typeof getSalesReportBundle>>;
  try {
    bundle = await getSalesReportBundle({ period, saName, modelId, source });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sales-report] bundle failed:", msg);
    return (
      <main className="px-6 py-10 text-center">
        <div className="inline-block bg-white border border-[#F5AEAD] rounded-lg px-6 py-5">
          <div className="text-[40px] mb-2">⚠️</div>
          <div className="text-[14px] font-semibold text-[#C8001A] mb-1">業績資料載入失敗</div>
          <div className="text-[12px] text-[#5A5955] font-mono">{msg.slice(0, 200)}</div>
        </div>
      </main>
    );
  }

  return (
    <SalesReportBoard
      kpis={bundle.kpis}
      ranking={bundle.ranking}
      models={bundle.models}
      sources={bundle.sources}
      trend={bundle.trend}
      orders={bundle.orders}
      options={bundle.options}
      filters={{ period, saName, modelId, source }}
      periodKey={bundle.periodKey}
      discountStats={bundle.discountStats}
    />
  );
}

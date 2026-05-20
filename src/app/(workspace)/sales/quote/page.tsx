/**
 * 賞車報價單 — List View (server component)
 *
 * RS04 賞車報價單 A 級升級（2026-05-20）— 完全 DB-driven。
 * 視覺：KpiCard 頂列 / FunnelChart 報價漏斗 / DataGrid 列表。
 *
 * 原 mock-only 互動報價表（QuoteLine 編輯器）已退役，
 * 後續若需要新增 / 編輯互動表單，走 /sales/quote/new 或 /sales/quote/[id]（待後續工項建）。
 */

import { Suspense } from "react";

import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listSalesQuotes,
  getQuoteKpis,
  getQuoteStatusBreakdown,
  QUOTES_PAGE_SIZE_DEFAULT,
} from "@/domain/sales-quote";
import QuoteBoard from "./_components/quote-board";

type SearchParams = {
  status?: string;
  vehicle_kind?: string;
  q?: string;
  page?: string;
};

export default async function QuoteListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = QUOTES_PAGE_SIZE_DEFAULT;
  const filterStatus = sp.status ?? "";
  const filterVehicleKind = sp.vehicle_kind ?? "";
  const filterQ = sp.q ?? "";

  const canView = await hasPermission(PERMISSIONS.SALES_ORDER_VIEW);
  if (!canView) {
    return (
      <main className="px-6 py-5">
        <div className="text-[13px] text-[#CC0000]">
          沒有檢視賞車報價單的權限。
        </div>
      </main>
    );
  }

  const [{ rows, totalCount }, kpis, statusBreakdown, canEdit] =
    await Promise.all([
      listSalesQuotes({
        status: filterStatus || undefined,
        vehicle_kind: filterVehicleKind || undefined,
        q: filterQ || undefined,
        page,
        pageSize,
      }),
      getQuoteKpis(),
      getQuoteStatusBreakdown(),
      hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
    ]);

  return (
    <Suspense fallback={null}>
      <QuoteBoard
        rows={rows}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        kpis={kpis}
        statusBreakdown={statusBreakdown}
        filterStatus={filterStatus}
        filterVehicleKind={filterVehicleKind}
        filterQ={filterQ}
        canEdit={canEdit}
      />
    </Suspense>
  );
}

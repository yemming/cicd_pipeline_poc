import { notFound } from "next/navigation";

import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSalesQuoteById } from "@/domain/sales-quote";
import { listVehicleModels } from "@/domain/vehicle-models";
import { getPendingApprovalForQuote } from "@/domain/discount-approvals";

import { QuotationDetailView } from "./_components/quotation-detail-view";

/**
 * 賞車報價單 Detail Page — view / edit mode
 *
 * 新增傳入：
 *   vehicleModels — 新車選款下拉清單（輪5-1：帶 msrp）
 *   pendingApproval — 此報價單是否有進行中的折扣審核（輪5-2 擋成交 / 輪5-5 倒數提示）
 */
export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  const [quote, canEdit] = await Promise.all([
    getSalesQuoteById(id),
    hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
  ]);

  if (!quote) notFound();

  // 輪5-1 / 5-2 / 5-5 所需的額外資料（parallel）
  const [vehicleModelsRes, pendingApproval] = await Promise.all([
    listVehicleModels({ status: "active" }, { pageSize: 200 }),
    getPendingApprovalForQuote(id),
  ]);

  return (
    <QuotationDetailView
      quote={quote}
      initialMode="view"
      canEdit={canEdit}
      vehicleModels={vehicleModelsRes.rows.map((m) => ({
        id: m.id,
        display_name: m.display_name,
        model_name: m.model_name,
        series: m.series,
        msrp: m.msrp,
      }))}
      pendingApproval={pendingApproval}
    />
  );
}
